import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { businessToday, daysOverdue, formatMxn } from '@pagares/domain-rules';
import {
  accountStatement,
  noteSigned,
  paymentReceipt,
  releaseLetter,
  type DocumentCardData,
} from '@pagares/emails';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { MAILER, type Mailer } from '../domain/ports/mailer.js';
import { NOTE_DOCUMENTS, type NoteDocuments } from '../../../shared/domain/note-documents.port.js';
import { withClock } from '../../promissory-notes/domain/note-status.js';

/** Qué documento se manda. Cada uno es una plantilla de §16. */
export type NoteDocumentKind = 'note' | 'receipt' | 'statement' | 'release';

export interface SendNoteDocumentInput {
  noteId: string;
  document: NoteDocumentKind;
  /** Obligatorio para el recibo: identifica el abono. */
  paymentId?: string | undefined;
}

/** Qué plantilla de §16 corresponde a cada documento. */
const TEMPLATE_BY_DOCUMENT: Record<NoteDocumentKind, string> = {
  note: 'note-signed-receipt',
  receipt: 'payment-receipt',
  statement: 'account-statement',
  release: 'release-letter',
};

const LONG_DATE = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Envío a demanda de un documento del pagaré (§15, `POST /admin/notes/:id/send-email`).
 *
 * Cubre los correos 6, 15, 16 y 17 (§16), que son los que llevan PDF: el
 * automático sale con el evento, pero el deudor pierde correos, cambia de cuenta
 * y pide "mándamelo otra vez". Sin esto, la respuesta era descargar el PDF y
 * adjuntarlo a mano desde el correo personal, fuera de toda bitácora.
 */
@Injectable()
export class SendNoteDocumentUseCase extends BaseUseCase<
  SendNoteDocumentInput,
  { sentTo: string; document: NoteDocumentKind }
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NOTE_DOCUMENTS) private readonly documents: NoteDocuments,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(SendNoteDocumentUseCase.name));
  }

  protected async handle(
    input: SendNoteDocumentInput,
    ctx: ExecutionContext,
  ): Promise<{ sentTo: string; document: NoteDocumentKind }> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      include: { debtor: true, owner: true },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const to = note.debtor.email ?? note.owner?.email ?? null;
    if (!to) {
      throw new BadRequestException(
        'Este deudor no tiene correo: el documento hay que entregarlo en mano o por WhatsApp',
      );
    }

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
    });
    const organizationName = settings?.legalName ?? note.creditorName;
    const now = this.clock.now();
    const balance = note.amountCents - note.paidCents;
    const status = withClock(
      note.status,
      daysOverdue(note.dueDate.toISOString().slice(0, 10), now),
    );

    const document: DocumentCardData = {
      folio: note.folio,
      amountFormatted: formatMxn(note.amountCents),
      amountInWords: note.amountInWords,
      balanceFormatted: formatMxn(balance),
      dueDateFormatted: LONG_DATE.format(note.dueDate),
      creditorName: note.creditorName,
      statusLabel: status === 'PAID' ? 'Liquidado' : status === 'OVERDUE' ? 'Vencido' : 'Vigente',
      statusTone: status === 'PAID' ? 'ok' : status === 'OVERDUE' ? 'crit' : 'neutral',
    };
    const common = {
      organizationName,
      fullName: note.debtor.fullName,
      document,
      appUrl: this.env.WEB_URL,
    };

    const { mail, attachment } = await this.compose(input, note, common, now);

    await this.mailer.send({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: [attachment],
      meta: {
        templateId: TEMPLATE_BY_DOCUMENT[input.document],
        noteId: note.id,
      },
    });

    // Reenviar un documento con datos personales es acción sensible (§9.3).
    return this.uow.run(async (scope) => {
      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: `note.send_email.${input.document}`,
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: { to, document: input.document, paymentId: input.paymentId ?? null },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        scope.client,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteDocumentSent',
        occurredAt: now,
        payload: { noteId: note.id, document: input.document, to },
      });

      return { sentTo: to, document: input.document };
    });
  }

  private async compose(
    input: SendNoteDocumentInput,
    note: { id: string; debtorId: string; folio: string; acceptedAt: Date | null; updatedAt: Date },
    common: {
      organizationName: string;
      fullName: string;
      document: DocumentCardData;
      appUrl: string;
    },
    now: Date,
  ): Promise<{
    mail: { subject: string; html: string; text: string };
    attachment: { filename: string; content: Buffer };
  }> {
    if (input.document === 'note') {
      return {
        mail: noteSigned({
          ...common,
          signedAtFormatted: LONG_DATE.format(note.acceptedAt ?? note.updatedAt),
        }),
        attachment: await this.documents.note(note.id),
      };
    }

    if (input.document === 'release') {
      return {
        mail: releaseLetter({ ...common, settledOnFormatted: LONG_DATE.format(note.updatedAt) }),
        attachment: await this.documents.release(note.id),
      };
    }

    if (input.document === 'statement') {
      const notes = await this.prisma.promissoryNote.count({
        where: { debtorId: note.debtorId, status: { notIn: ['VOID', 'RENEWED'] } },
      });
      const today = businessToday(now);
      return {
        mail: accountStatement({
          organizationName: common.organizationName,
          fullName: common.fullName,
          cutoffFormatted: LONG_DATE.format(new Date(`${today}T00:00:00Z`)),
          totalBalanceFormatted: common.document.balanceFormatted ?? formatMxn(0n),
          noteCount: notes,
          appUrl: common.appUrl,
        }),
        attachment: await this.documents.statement(note.debtorId),
      };
    }

    if (!input.paymentId) {
      throw new BadRequestException('Para mandar un recibo hace falta decir de qué abono');
    }
    const payment = await this.prisma.payment.findFirst({
      // El abono tiene que ser **de este pagaré**: si no, mandaríamos el recibo
      // de otro cliente a este correo (§9.1, API1).
      where: { id: input.paymentId, noteId: note.id },
    });
    if (!payment) throw new NotFoundException('El abono no existe en este pagaré');

    /*
     * El PDF se dibuja **antes** de redactar el correo porque es al dibujarlo
     * cuando el recibo estrena su folio (§17.1). Antes se ponía aquí el folio
     * del pagaré, con lo que el correo anunciaba un recibo `PAG-…` que no
     * coincidía con el `REC-…` del documento adjunto.
     */
    const attachment = await this.documents.receipt(payment.id);
    const stamped = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { receiptFolio: true },
    });

    return {
      mail: paymentReceipt({
        ...common,
        receiptFolio: stamped.receiptFolio ?? note.folio,
        amountPaidFormatted: formatMxn(payment.amountCents),
        paidOnFormatted: LONG_DATE.format(payment.paidOn),
        appliedToInterestFormatted: formatMxn(payment.appliedToInterestCents),
        appliedToPrincipalFormatted: formatMxn(payment.appliedToPrincipalCents),
      }),
      attachment,
    };
  }
}
