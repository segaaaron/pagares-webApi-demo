import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { daysOverdue, formatMxn } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { deriveState } from '../../promissory-notes/domain/note-status.js';

export interface VoidPaymentInput {
  paymentId: string;
  reasonCode: string;
  reasonNote: string;
}

/**
 * Anulación de un abono (§12.2).
 *
 * No se edita ni se borra la fila original: se asienta una **reversa** con
 * importe negativo que la referencia. Así el error y su corrección conviven como
 * hechos ordenados, que es como se lleva cualquier registro de dinero.
 */
@Injectable()
export class VoidPaymentUseCase extends BaseUseCase<VoidPaymentInput, { reversalId: string; balance: string }> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(VoidPaymentUseCase.name));
  }

  protected async handle(
    input: VoidPaymentInput,
    ctx: ExecutionContext,
  ): Promise<{ reversalId: string; balance: string }> {
    const now = this.clock.now();
    const original = await this.prisma.payment.findUniqueOrThrow({
      where: { id: input.paymentId },
      include: { note: true, reversedBy: true },
    });

    if (original.reversalOfId !== null) {
      throw new BadRequestException('Una reversa no se puede reversar');
    }
    if (original.reversedBy) {
      throw new BadRequestException('Ese abono ya fue anulado');
    }

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const actor = ctx.actorId ?? 'system';
      const note = original.note;

      const reversal = await tx.payment.create({
        data: {
          noteId: note.id,
          // Importe negativo: el libro es sólo de anexar y la suma sigue cuadrando.
          amountCents: -original.amountCents,
          appliedToInterestCents: -original.appliedToInterestCents,
          // También el interés ordinario: si la reversa no lo devolviera, la
          // cuota quedaría con su precio pagado y el dinero fuera (§12).
          appliedToOrdinaryInterestCents: -original.appliedToOrdinaryInterestCents,
          appliedToPrincipalCents: -original.appliedToPrincipalCents,
          isRecovery: original.isRecovery,
          paidOn: original.paidOn,
          method: original.method,
          reference: original.reference,
          reversalOfId: original.id,
          reversalReason: `${input.reasonCode}: ${input.reasonNote}`,
          registeredBy: actor,
        },
      });

      const paidCents = note.paidCents - original.amountCents;
      const overdue = daysOverdue(note.dueDate.toISOString().slice(0, 10), now);
      const derived = deriveState({
        amountCents: note.amountCents,
        paidCents,
        daysOverdue: overdue,
        hasSignature: true,
        signatureProcessing: false,
        voidedAt: note.voidedAt,
        writtenOffAt: note.writtenOffAt,
        renewedById: null,
        hasActiveSettlement: false,
      });

      await tx.promissoryNote.update({
        where: { id: note.id },
        data: { paidCents, status: derived.status },
      });

      await this.audit.record(
        {
          actorId: actor,
          actorRole: ctx.actorRole,
          action: 'payment.void',
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: {
            paymentId: original.id,
            reversalId: reversal.id,
            amountCents: original.amountCents.toString(),
            reasonCode: input.reasonCode,
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'PaymentVoided',
        occurredAt: now,
        payload: { noteId: note.id, paymentId: original.id, reversalId: reversal.id },
      });

      return { reversalId: reversal.id, balance: formatMxn(note.amountCents - paidCents) };
    });
  }
}
