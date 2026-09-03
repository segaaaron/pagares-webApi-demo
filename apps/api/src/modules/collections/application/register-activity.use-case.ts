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
import { businessToday } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';

export interface RegisterActivityInput {
  noteId: string;
  type: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'VISIT' | 'OTHER';
  outcome: 'NO_ANSWER' | 'PROMISED' | 'REFUSED' | 'PAID' | 'DISPUTED';
  promisedOn?: string | undefined;
  notes?: string | undefined;
}

/**
 * Bitácora de gestión (§13.3).
 *
 * Sin esto el seguimiento vive en la cabeza del cobrador. Cuando el resultado es
 * una promesa de pago lleva fecha comprometida: al incumplirse, el pagaré vuelve
 * solo a la bandeja de Hoy y nadie tiene que acordarse.
 */
@Injectable()
export class RegisterActivityUseCase extends BaseUseCase<RegisterActivityInput, { id: string }> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RegisterActivityUseCase.name));
  }

  protected async handle(input: RegisterActivityInput, ctx: ExecutionContext): Promise<{ id: string }> {
    const now = this.clock.now();
    const today = businessToday(now);

    if (input.outcome === 'PROMISED' && !input.promisedOn) {
      throw new BadRequestException('Una promesa de pago necesita fecha comprometida');
    }
    if (input.promisedOn && input.promisedOn < today) {
      throw new BadRequestException('La fecha prometida no puede ser anterior a hoy');
    }

    await this.prisma.promissoryNote.findUniqueOrThrow({ where: { id: input.noteId } });

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const activity = await tx.collectionActivity.create({
        data: {
          noteId: input.noteId,
          type: input.type,
          outcome: input.outcome,
          promisedOn: input.promisedOn ? new Date(`${input.promisedOn}T00:00:00Z`) : null,
          notes: input.notes ?? null,
          registeredBy: ctx.actorId ?? 'system',
        },
      });

      if (input.outcome === 'PROMISED') {
        scope.publish({
          eventId: randomUUID(),
          eventType: 'PromiseMade',
          occurredAt: now,
          payload: { noteId: input.noteId, activityId: activity.id, promisedOn: input.promisedOn },
        });
      }

      return { id: activity.id };
    });
  }
}
