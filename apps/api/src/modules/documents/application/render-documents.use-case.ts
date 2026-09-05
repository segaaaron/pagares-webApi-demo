import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { createHash } from 'node:crypto';
import { amountToWords, businessToday, formatMxn } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { NumberingService } from '../../numbering/numbering.service.js';
import { PDF_RENDERER, type PdfRenderer } from '../domain/ports/pdf-renderer.js';

const LONG_DATE = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CHECK: 'Cheque',
  OTHER: 'Otro',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_SIGNATURE: 'Por firmar',
  PROCESSING_SIGNATURE: 'Procesando',
  ISSUED: 'Vigente',
  PARTIALLY_PAID: 'Abonado',
  OVERDUE: 'Vencido',
  PAID: 'Liquidado',
  RESTRUCTURED: 'En convenio',
  RENEWED: 'Renovado',
  WRITTEN_OFF: 'Castigado',
  VOID: 'Anulado',
};

@Injectable()
export class RenderReceiptUseCase extends BaseUseCase<{ paymentId: string }, Buffer> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RenderReceiptUseCase.name));
  }

  protected async handle(input: { paymentId: string }, _ctx: ExecutionContext): Promise<Buffer> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { note: { include: { debtor: true } } },
    });
    if (!payment) throw new NotFoundException('El abono no existe');

    // Un recibo acredita dinero recibido. La condonación cierra el pagaré sin
    // que entrara nada: emitirle recibo sería firmar un comprobante de un pago
    // que no existió, y el deudor podría exhibirlo como tal (§25.16). El panel
    // ya no ofrece el enlace; esto lo impide también por la puerta de atrás.
    if (payment.isWaiver) {
      throw new BadRequestException(
        'Una condonación no tiene recibo: no hubo pago que acreditar. La liquidación consta en la carta de finiquito',
      );
    }

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const now = this.clock.now();

    const receiptFolio = await this.folioFor(payment, settings?.receiptFolioPrefix ?? 'REC', now);

    /*
     * El saldo que va en el recibo es el que quedó **después de ese abono**, no
     * el de hoy. Un recibo es un documento histórico: reimprimir el de marzo
     * después de dos abonos más no puede cambiar la cifra que ya se entregó.
     */
    const upToThisOne = await this.prisma.payment.findMany({
      where: {
        noteId: payment.noteId,
        OR: [
          { paidOn: { lt: payment.paidOn } },
          { paidOn: payment.paidOn, createdAt: { lte: payment.createdAt } },
        ],
      },
      select: { amountCents: true },
    });

    let paidThen = 0n;
    for (const row of upToThisOne) paidThen += row.amountCents;
    const balanceAfter = payment.note.amountCents - paidThen;

    return this.renderer.renderReceipt({
      receiptFolio,
      noteFolio: payment.note.folio,
      organizationName: settings?.legalName ?? payment.note.creditorName,
      organizationAddress: settings?.address ?? '',
      debtorName: payment.note.debtor.fullName,
      amountFormatted: formatMxn(payment.amountCents),
      amountInWords: amountToWords(
        payment.amountCents < 0n ? -payment.amountCents : payment.amountCents,
      ),
      appliedToInterest: formatMxn(payment.appliedToInterestCents),
      appliedToOrdinaryInterest: formatMxn(payment.appliedToOrdinaryInterestCents),
      appliedToPrincipal: formatMxn(payment.appliedToPrincipalCents),
      balanceAfter: formatMxn(balanceAfter),
      paidOnFormatted: LONG_DATE.format(payment.paidOn),
      methodLabel: METHOD_LABEL[payment.method] ?? payment.method,
      reference: payment.reference,
      issuedAtFormatted: LONG_DATE.format(new Date(`${businessToday(now)}T00:00:00Z`)),
    });
  }

  /**
   * El folio del recibo, asignado una sola vez.
   *
   * Tiene su propia secuencia, distinta de la del pagaré. Antes se pedía uno
   * nuevo en cada render: descargar el mismo recibo dos veces daba dos folios y
   * dejaba huecos en la secuencia, que es justo lo que un folio no puede hacer
   * (§17.1, §25.3).
   */
  private async folioFor(
    payment: { id: string; receiptFolio: string | null; paidOn: Date },
    prefix: string,
    now: Date,
  ): Promise<string> {
    if (payment.receiptFolio) return payment.receiptFolio;

    return this.prisma.$transaction(async (tx) => {
      // Se relee dentro de la transacción: dos descargas simultáneas del mismo
      // recibo no pueden acabar con dos folios.
      const fresh = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: { receiptFolio: true },
      });
      if (fresh.receiptFolio) return fresh.receiptFolio;

      const folio = await this.numbering.next(
        tx,
        'RECEIPT',
        Number(businessToday(now).slice(0, 4)),
        { prefix, padding: 6 },
      );
      await tx.payment.update({ where: { id: payment.id }, data: { receiptFolio: folio } });
      return folio;
    });
  }
}

@Injectable()
export class RenderReleaseUseCase extends BaseUseCase<{ noteId: string }, Buffer> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RenderReleaseUseCase.name));
  }

  protected async handle(input: { noteId: string }, _ctx: ExecutionContext): Promise<Buffer> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      include: { debtor: true, payments: { orderBy: { paidOn: 'desc' }, take: 1 } },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');
    if (note.status !== 'PAID') {
      // Emitir un finiquito de algo no liquidado sería certificar una falsedad.
      throw new NotFoundException('El pagaré no está liquidado');
    }

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const now = this.clock.now();
    const lastPayment = note.payments[0];

    return this.renderer.renderRelease({
      noteFolio: note.folio,
      organizationName: settings?.legalName ?? note.creditorName,
      organizationAddress: settings?.address ?? '',
      debtorName: note.debtor.fullName,
      amountFormatted: formatMxn(note.amountCents),
      settledOnFormatted: LONG_DATE.format(lastPayment?.paidOn ?? note.updatedAt),
      issuedAtFormatted: LONG_DATE.format(new Date(`${businessToday(now)}T00:00:00Z`)),
      place: settings?.defaultIssuePlace ?? note.issuePlace,
    });
  }
}

@Injectable()
export class RenderStatementUseCase extends BaseUseCase<{ debtorId: string }, Buffer> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RenderStatementUseCase.name));
  }

  protected async handle(input: { debtorId: string }, _ctx: ExecutionContext): Promise<Buffer> {
    const debtor = await this.prisma.debtor.findUnique({
      where: { id: input.debtorId },
      include: { promissoryNotes: { orderBy: { dueDate: 'asc' } } },
    });
    if (!debtor) throw new NotFoundException('El cliente no existe');

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const now = this.clock.now();
    const today = businessToday(now);

    const statementFolio = await this.numbering.next(this.prisma, 'STATEMENT', Number(today.slice(0, 4)), {
      prefix: settings?.statementPrefix ?? 'EDC',
      padding: 6,
    });

    let totalBalance = 0n;
    let totalPaid = 0n;
    for (const note of debtor.promissoryNotes) {
      if (note.status === 'VOID' || note.status === 'RENEWED') continue;
      totalBalance += note.amountCents - note.paidCents;
      totalPaid += note.paidCents;
    }

    return this.renderer.renderStatement({
      statementFolio,
      organizationName: settings?.legalName ?? '',
      organizationAddress: settings?.address ?? '',
      debtorName: debtor.fullName,
      cutoffFormatted: LONG_DATE.format(new Date(`${today}T00:00:00Z`)),
      notes: debtor.promissoryNotes.map((n) => ({
        folio: n.folio,
        issueDate: n.issueDate.toISOString().slice(0, 10),
        dueDate: n.dueDate.toISOString().slice(0, 10),
        amount: formatMxn(n.amountCents),
        paid: formatMxn(n.paidCents),
        balance: formatMxn(n.amountCents - n.paidCents),
        statusLabel: STATUS_LABEL[n.status] ?? n.status,
      })),
      totalBalance: formatMxn(totalBalance),
      totalPaid: formatMxn(totalPaid),
    });
  }
}

const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'medium',
  timeZone: 'America/Mexico_City',
});

@Injectable()
export class RenderEvidenceUseCase extends BaseUseCase<{ noteId: string }, Buffer> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RenderEvidenceUseCase.name));
  }

  protected async handle(input: { noteId: string }, _ctx: ExecutionContext): Promise<Buffer> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      include: { debtor: true, signature: true },
    });
    if (!note?.signature) {
      // Sin firma no hay nada que certificar.
      throw new NotFoundException('El pagaré no tiene firma registrada');
    }

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const enabledBy = note.signature.enabledBy
      ? await this.prisma.user.findUnique({
          where: { id: note.signature.enabledBy },
          select: { fullName: true, email: true },
        })
      : null;

    return this.renderer.renderEvidence({
      noteFolio: note.folio,
      organizationName: settings?.legalName ?? note.creditorName,
      organizationAddress: settings?.address ?? '',
      debtorName: note.debtor.fullName,
      amountFormatted: formatMxn(note.amountCents),
      // La huella del documento es la del contenido que se firmó, no la del PDF
      // que se imprime después: el PDF se regenera, el contenido no cambia.
      documentSha256: createHash('sha256')
        .update(
          [
            note.folio,
            note.amountCents.toString(),
            note.issueDate.toISOString(),
            note.dueDate.toISOString(),
            note.creditorName,
            note.debtor.fullName,
          ].join('|'),
        )
        .digest('hex'),
      signatureSha256: note.signature.sha256,
      capturedAtFormatted: DATE_TIME.format(note.signature.capturedAt),
      acceptedAtFormatted: note.acceptedAt ? DATE_TIME.format(note.acceptedAt) : null,
      scrolledToEndAtFormatted: note.scrolledToEndAt ? DATE_TIME.format(note.scrolledToEndAt) : null,
      mode: note.signature.mode,
      enabledByLabel: enabledBy ? `${enabledBy.fullName} (${enabledBy.email})` : null,
      ipAddress: note.signature.ipAddress,
      deviceModel: note.signature.deviceModel,
      osVersion: note.signature.osVersion,
      appVersion: note.signature.appVersion,
      inputType: note.signature.inputType,
      strokeCount: note.signature.strokeCount,
      durationMs: note.signature.durationMs,
      issuedAtFormatted: DATE_TIME.format(this.clock.now()),
    });
  }
}
