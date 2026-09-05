import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, describeRate, formatMxn } from '@pagares/domain-rules';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../media/domain/ports/object-storage.js';
import { PDF_RENDERER, type PdfRenderer } from '../domain/ports/pdf-renderer.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';

const DATE = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Mexico_City',
});

const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

@Injectable()
export class RenderNotePdfUseCase extends BaseUseCase<{ id: string }, Buffer> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RenderNotePdfUseCase.name));
  }

  protected async handle(input: { id: string }, _ctx: ExecutionContext): Promise<Buffer> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.id },
      include: {
        debtor: true,
        signature: true,
        // Los abonos se anotan en el título (art. 17 LGTOC).
        payments: { orderBy: { paidOn: 'asc' } },
        // El aval va en el documento con su firma: sin ella no queda obligado.
        guarantors: { include: { signature: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const verifyUrl = `${this.env.WEB_URL}/p/${note.publicToken}`;

    return this.renderer.renderNote({
      folio: note.folio,
      organizationName: settings?.legalName ?? note.creditorName,
      organizationAddress: settings?.address ?? '',
      organizationPhone: settings?.phone ?? null,
      organizationEmail: settings?.email ?? null,
      creditorName: note.creditorName,
      amountFormatted: formatMxn(note.amountCents),
      amountInWords: note.amountInWords,
      currency: note.currency,
      issuePlace: note.issuePlace,
      issueDateFormatted: DATE.format(note.issueDate),
      paymentPlace: note.paymentPlace,
      dueDateFormatted: DATE.format(note.dueDate),
      interestRateLabel: describeRate(
        note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
        note.interestPeriod,
      ),
      /*
       * Las tasas pactadas van en el título, las dos: la ordinaria es el precio
       * del préstamo y la moratoria la sanción por pagar tarde. Si no constan,
       * no se pueden exigir aunque se hayan acordado (§12, ADR 0016).
       */
      plan:
        note.planModel && note.planModel !== 'NONE'
          ? {
              positionLabel:
                note.seriesIndex && note.seriesSize
                  ? `Pago ${note.seriesIndex} de ${note.seriesSize}`
                  : 'Pago único',
              rateLabel: describeRate(
                note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
                note.interestPeriod,
              ),
              modelLabel:
                note.planModel === 'INSOLUTOS'
                  ? 'Sobre saldos insolutos'
                  : 'Sobre el importe original',
              interestFormatted: formatMxn(note.planInterestCents ?? 0n),
              principalFormatted: formatMxn(
                note.planPrincipalCents ?? note.amountCents - (note.planInterestCents ?? 0n),
              ),
            }
          : null,
      status: note.status,
      payments: note.payments
        // La reversa y su abono se anulan entre sí: anotar los dos en el papel
        // confunde a quien lo lee. Se anota lo que quedó vigente.
        .filter((payment) => payment.amountCents > 0n && payment.reversalOfId === null)
        .map((payment) => ({
          dateFormatted: DATE.format(payment.paidOn),
          amountFormatted: formatMxn(payment.amountCents),
        })),
      paidFormatted: formatMxn(note.paidCents),
      balanceFormatted: formatMxn(note.amountCents - note.paidCents),
      // Dónde comprobar que este papel corresponde a un pagaré real (§17.1).
      verifyUrl,
      /*
       * El QR va junto al enlace en texto y no en su lugar: un expediente en
       * papel no siempre se puede escanear, y un enlace que no se puede teclear
       * no verifica nada.
       */
      verifyQrBase64: await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: 'M',
        margin: 0,
        width: 220,
      }).catch(() => null),
      interestBasis: settings?.interestBasis ?? 360,
      signatureEvidence: note.signature
        ? {
            deviceModel: note.signature.deviceModel,
            strokeCount: note.signature.strokeCount,
            durationMs: note.signature.durationMs,
            mode: note.signature.mode,
          }
        : null,
      issuedAtFormatted: DATE.format(new Date(`${businessToday(this.clock.now())}T12:00:00Z`)),
      negotiable: note.negotiable,
      observations: note.observations,
      debtor: {
        fullName: note.debtor.fullName,
        address: note.debtor.address,
        phone: note.debtor.phone,
      },
      guarantors: note.guarantors.map((guarantor) => ({
        position: guarantor.position,
        fullName: guarantor.fullName,
        address: guarantor.address,
        phone: guarantor.phone,
      })),
      signaturePngBase64: note.signature ? await this.signatureAsPng(note.signature.assetId) : null,
      signatureCapturedAt: note.signature ? DATE_TIME.format(note.signature.capturedAt) : null,
      signatureSha256: note.signature?.sha256 ?? null,
    });
  }

  /**
   * La firma se guarda en WebP, que `@react-pdf` no admite. Se convierte a PNG
   * en memoria conservando el alfa: sin transparencia aparecería un recuadro
   * blanco sobre el documento (§17.1).
   */
  private async signatureAsPng(key: string): Promise<string | null> {
    try {
      const url = await this.storage.signedUrl(key, 60);
      const response = await fetch(url);
      if (!response.ok) return null;
      const webp = Buffer.from(await response.arrayBuffer());
      const png = await sharp(webp).png().toBuffer();
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch {
      // Un fallo del almacenamiento no debe impedir emitir el documento: sale
      // sin la imagen y con la línea de firma en blanco.
      return null;
    }
  }
}
