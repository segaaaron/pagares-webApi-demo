import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, type ExecutionContext } from '@pagares/api-core';
import { describeRate, formatMxn } from '@pagares/domain-rules';
import sharp from 'sharp';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../media/domain/ports/object-storage.js';
import { PDF_RENDERER, type PdfRenderer } from '../domain/ports/pdf-renderer.js';

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
  ) {
    super(new NestUseCaseLogger(RenderNotePdfUseCase.name));
  }

  protected async handle(input: { id: string }, _ctx: ExecutionContext): Promise<Buffer> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.id },
      include: {
        debtor: true,
        signature: true,
        // El aval va en el documento con su firma: sin ella no queda obligado.
        guarantors: { include: { signature: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });

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
