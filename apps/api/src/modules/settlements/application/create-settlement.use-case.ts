import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { businessToday, formatMxn } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { acceptsPayments } from '../../promissory-notes/domain/note-status.js';
import { NoteNotPayableError } from '../../promissory-notes/domain/note.errors.js';
import { ForgivenessExceedsBalanceError, SettlementAlreadyActiveError } from '../domain/settlement.errors.js';
import { assertWrittenConfirmation } from '../../../shared/domain/written-confirmation.js';

export interface CreateSettlementInput {
  noteId: string;
  agreedCents: string;
  forgivenCents: string;
  dueOn: string;
  terms?: string | undefined;
  /** Folio teclado a mano: la quita es dinero perdonado (§24.5). */
  confirmFolio?: string | undefined;
}

export interface CreateSettlementOutput {
  id: string;
  agreed: string;
  forgiven: string;
  dueOn: string;
}

/**
 * Convenio de pago con quita (§13.4).
 *
 * Lo convenido más lo perdonado debe cubrir el saldo: si no, el convenio dejaría
 * un remanente sin explicar. El pagaré pasa a `RESTRUCTURED` y, si el convenio se
 * incumple, vuelve solo a `OVERDUE` con su saldo original.
 */
@Injectable()
export class CreateSettlementUseCase extends BaseUseCase<CreateSettlementInput, CreateSettlementOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(CreateSettlementUseCase.name));
  }

  protected async handle(
    input: CreateSettlementInput,
    ctx: ExecutionContext,
  ): Promise<CreateSettlementOutput> {
    const now = this.clock.now();
    const note = await this.prisma.promissoryNote.findUniqueOrThrow({
      where: { id: input.noteId },
      include: { settlements: { where: { status: 'ACTIVE' } } },
    });

    // La quita perdona deuda y no se revierte: se confirma escribiendo el
    // folio del pagaré (§24.5).
    assertWrittenConfirmation(note.folio, input.confirmFolio ?? '');

    if (!acceptsPayments(note.status)) throw new NoteNotPayableError(note.status);
    if (note.settlements.length > 0) throw new SettlementAlreadyActiveError();

    const balance = note.amountCents - note.paidCents;
    const agreed = BigInt(input.agreedCents);
    const forgiven = BigInt(input.forgivenCents);
    if (agreed + forgiven > balance || agreed <= 0n) {
      throw new ForgivenessExceedsBalanceError(balance);
    }

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const actor = ctx.actorId ?? 'system';

      const settlement = await tx.settlement.create({
        data: {
          noteId: note.id,
          agreedCents: agreed,
          forgivenCents: forgiven,
          dueOn: new Date(`${input.dueOn}T00:00:00Z`),
          terms: input.terms ?? null,
          status: 'ACTIVE',
          authorizedBy: actor,
        },
      });

      await tx.promissoryNote.update({
        where: { id: note.id },
        data: { status: 'RESTRUCTURED', collectionStage: 'EXTRAJUDICIAL' },
      });

      await this.audit.record(
        {
          actorId: actor,
          actorRole: ctx.actorRole,
          action: 'settlement.create',
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: {
            settlementId: settlement.id,
            agreedCents: agreed.toString(),
            // La quita es una pérdida: se registra explícitamente para el reporte.
            forgivenCents: forgiven.toString(),
            dueOn: input.dueOn,
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'SettlementCreated',
        occurredAt: now,
        payload: {
          noteId: note.id,
          folio: note.folio,
          settlementId: settlement.id,
          agreedCents: agreed.toString(),
          forgivenCents: forgiven.toString(),
          dueOn: input.dueOn,
          today: businessToday(now),
        },
      });

      return {
        id: settlement.id,
        agreed: formatMxn(agreed),
        forgiven: formatMxn(forgiven),
        dueOn: input.dueOn,
      };
    });
  }
}
