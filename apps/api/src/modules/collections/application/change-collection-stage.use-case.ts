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
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';

export type CollectionStage =
  | 'PREVENTIVA'
  | 'ADMINISTRATIVA'
  | 'EXTRAJUDICIAL'
  | 'JUDICIAL'
  | 'CASTIGO';

export interface ChangeCollectionStageInput {
  noteId: string;
  stage?: CollectionStage | undefined;
  frozen?: boolean | undefined;
  reason: string;
}

export interface ChangeCollectionStageResult {
  noteId: string;
  collectionStage: CollectionStage;
  stageFrozen: boolean;
}

/**
 * Adelantar o congelar la etapa de gestión (§13.2).
 *
 * La etapa se **sugiere** por días de atraso, pero el calendario no sabe si el
 * deudor contestó ayer y prometió pagar el viernes. Congelarla es lo que impide
 * que ese caso escale a judicial por pura acumulación de días; adelantarla, lo
 * que permite tratar como extrajudicial a quien ya dijo que no piensa pagar.
 *
 * Exige motivo y queda en la bitácora: es una decisión de criterio, y dentro de
 * seis meses alguien va a preguntar por qué este pagaré no escaló.
 */
@Injectable()
export class ChangeCollectionStageUseCase extends BaseUseCase<
  ChangeCollectionStageInput,
  ChangeCollectionStageResult
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ChangeCollectionStageUseCase.name));
  }

  protected async handle(
    input: ChangeCollectionStageInput,
    ctx: ExecutionContext,
  ): Promise<ChangeCollectionStageResult> {
    const previo = await this.prisma.promissoryNote.findUniqueOrThrow({
      where: { id: input.noteId },
      select: { id: true, collectionStage: true, stageFrozen: true },
    });

    const stage = input.stage ?? (previo.collectionStage as CollectionStage);
    const frozen = input.frozen ?? previo.stageFrozen;

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      const fila = await tx.promissoryNote.update({
        where: { id: input.noteId },
        data: { collectionStage: stage, stageFrozen: frozen },
        select: { id: true, collectionStage: true, stageFrozen: true },
      });

      scope.publish({
        eventId: randomUUID(),
        eventType: 'CollectionStageChanged',
        occurredAt: this.clock.now(),
        payload: {
          noteId: input.noteId,
          from: previo.collectionStage,
          to: stage,
          frozenFrom: previo.stageFrozen,
          frozenTo: frozen,
          reason: input.reason,
          actorId: ctx.actorId ?? 'system',
        },
      });

      return {
        noteId: fila.id,
        collectionStage: fila.collectionStage as CollectionStage,
        stageFrozen: fila.stageFrozen,
      };
    });
  }
}
