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
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { SettlementExpiredError } from '../domain/settlement.errors.js';

export interface CloseSettlementInput {
  settlementId: string;
  outcome: 'FULFILLED' | 'BROKEN';
}

/**
 * Cierre de un convenio (§13.4).
 *
 * Cumplido: el saldo se da por cubierto y la quita queda registrada como pérdida.
 * Incumplido: **el pagaré vuelve a su saldo original** y reaparece en la bandeja.
 * Perdonar la diferencia sin que el convenio se cumpliera sería regalar dinero.
 */
@Injectable()
export class CloseSettlementUseCase extends BaseUseCase<CloseSettlementInput, { status: string }> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(CloseSettlementUseCase.name));
  }

  protected async handle(input: CloseSettlementInput, ctx: ExecutionContext): Promise<{ status: string }> {
    const now = this.clock.now();
    const settlement = await this.prisma.settlement.findUniqueOrThrow({
      where: { id: input.settlementId },
      include: { note: true },
    });
    if (settlement.status !== 'ACTIVE') throw new SettlementExpiredError();

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const actor = ctx.actorId ?? 'system';
      const note = settlement.note;

      await tx.settlement.update({
        where: { id: settlement.id },
        data: { status: input.outcome, closedAt: now },
      });

      if (input.outcome === 'FULFILLED') {
        // La quita se aplica como parte pagada: cierra el saldo sin inventar un abono.
        await tx.promissoryNote.update({
          where: { id: note.id },
          data: { paidCents: note.amountCents, status: 'PAID' },
        });
      } else {
        // Vuelve al estado que le corresponde por sus abonos; si además está
        // atrasado, se verá vencido al leer (§11.2). `OVERDUE` no se guarda.
        await tx.promissoryNote.update({
          where: { id: note.id },
          data: {
            status: note.paidCents > 0n ? 'PARTIALLY_PAID' : 'ISSUED',
            collectionStage: 'EXTRAJUDICIAL',
          },
        });
      }

      await this.audit.record(
        {
          actorId: actor,
          actorRole: ctx.actorRole,
          action: `settlement.${input.outcome.toLowerCase()}`,
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: {
            settlementId: settlement.id,
            forgivenCents: settlement.forgivenCents.toString(),
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: input.outcome === 'FULFILLED' ? 'NoteSettled' : 'SettlementBroken',
        occurredAt: now,
        payload: { noteId: note.id, folio: note.folio, settlementId: settlement.id },
      });

      return { status: input.outcome };
    });
  }
}
