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
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { assertWrittenConfirmation } from '../../../shared/domain/written-confirmation.js';
import { canTransition, type NoteStatus } from '../domain/note-status.js';
import { InvalidStatusTransitionError } from '../domain/note.errors.js';
import { isVoidReason, isWriteOffReason, VOID_REASONS, WRITE_OFF_REASONS } from '../domain/void-reasons.js';

export type LifecycleAction = 'void' | 'write-off' | 'reinstate';

export interface ChangeStatusInput {
  noteId: string;
  action: LifecycleAction;
  reasonCode: string;
  reasonNote: string;
  /** Folio teclado a mano. Obligatorio para castigar (§24.5). */
  confirmFolio?: string | undefined;
}

export interface ChangeStatusOutput {
  noteId: string;
  status: NoteStatus;
}

/**
 * Anulación, castigo y reversión del castigo (§11.3).
 *
 * Son las únicas transiciones manuales con consecuencia económica, así que las
 * tres exigen motivo de catálogo y quedan en la bitácora encadenada. **Castigar
 * no es perdonar**: el pagaré sale de la cartera activa pero la deuda sigue
 * siendo exigible y admite abonos como recuperación.
 */
@Injectable()
export class ChangeNoteStatusUseCase extends BaseUseCase<ChangeStatusInput, ChangeStatusOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ChangeNoteStatusUseCase.name));
  }

  protected async handle(input: ChangeStatusInput, ctx: ExecutionContext): Promise<ChangeStatusOutput> {
    const now = this.clock.now();
    const note = await this.prisma.promissoryNote.findUniqueOrThrow({ where: { id: input.noteId } });

    const target = this.targetStatus(input.action, note);
    if (!canTransition(note.status, target)) {
      throw new InvalidStatusTransitionError(note.status, target);
    }
    this.assertReason(input);

    // El castigo saca el pagaré de la cartera activa: se confirma escribiendo
    // su folio, no pulsando un botón (§24.5).
    if (input.action === 'write-off') {
      assertWrittenConfirmation(note.folio, input.confirmFolio ?? '');
    }

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const actor = ctx.actorId ?? 'system';

      const data =
        input.action === 'void'
          ? { status: target, voidedAt: now, voidReason: `${input.reasonCode}: ${input.reasonNote}`, voidedBy: actor }
          : input.action === 'write-off'
            ? {
                status: target,
                writtenOffAt: now,
                writeOffReason: `${input.reasonCode}: ${input.reasonNote}`,
                writtenOffBy: actor,
                collectionStage: 'CASTIGO' as const,
              }
            : // Revertir el castigo limpia las marcas: el saldo vuelve a la cartera activa.
              { status: target, writtenOffAt: null, writeOffReason: null, writtenOffBy: null };

      await tx.promissoryNote.update({ where: { id: note.id }, data });

      await this.audit.record(
        {
          actorId: actor,
          actorRole: ctx.actorRole,
          action: `note.${input.action}`,
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: { from: note.status, to: target, reasonCode: input.reasonCode, reasonNote: input.reasonNote },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: input.action === 'void' ? 'NoteVoided' : input.action === 'write-off' ? 'NoteWrittenOff' : 'NoteReinstated',
        occurredAt: now,
        payload: { noteId: note.id, folio: note.folio, reasonCode: input.reasonCode },
      });

      return { noteId: note.id, status: target };
    });
  }

  private targetStatus(action: LifecycleAction, note: { paidCents: bigint }): NoteStatus {
    switch (action) {
      case 'void':
        return 'VOID';
      case 'write-off':
        return 'WRITTEN_OFF';
      case 'reinstate':
        // Revertir el castigo devuelve el pagaré a su estado por saldo; si está
        // atrasado se mostrará vencido al leerlo (§11.2), no al guardarlo.
        return note.paidCents > 0n ? 'PARTIALLY_PAID' : 'ISSUED';
    }
  }

  private assertReason(input: ChangeStatusInput): void {
    if (input.action === 'void' && !isVoidReason(input.reasonCode)) {
      throw new BadRequestException(
        `Motivo inválido. Opciones: ${Object.keys(VOID_REASONS).join(', ')}`,
      );
    }
    if (input.action === 'write-off' && !isWriteOffReason(input.reasonCode)) {
      throw new BadRequestException(
        `Motivo inválido. Opciones: ${Object.keys(WRITE_OFF_REASONS).join(', ')}`,
      );
    }
  }
}
