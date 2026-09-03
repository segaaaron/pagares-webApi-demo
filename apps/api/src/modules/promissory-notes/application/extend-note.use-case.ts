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
import { addYears } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { FINAL_STATUSES } from '../domain/note-status.js';

export interface ExtendNoteInput {
  noteId: string;
  newDueDate: string;
  reason: string;
}

/**
 * Prórroga (§13.5). Extender un vencimiento **no es editar la fecha**: el
 * documento firmado ya existe, así que se registra el cambio con su fecha
 * anterior, su motivo y quién lo autorizó. El pagaré conserva su firma porque
 * sigue siendo el mismo documento.
 */
@Injectable()
export class ExtendNoteUseCase extends BaseUseCase<ExtendNoteInput, { noteId: string; dueDate: string }> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ExtendNoteUseCase.name));
  }

  protected async handle(
    input: ExtendNoteInput,
    ctx: ExecutionContext,
  ): Promise<{ noteId: string; dueDate: string }> {
    const now = this.clock.now();
    const note = await this.prisma.promissoryNote.findUniqueOrThrow({ where: { id: input.noteId } });

    if (FINAL_STATUSES.has(note.status)) {
      throw new BadRequestException('Un pagaré en estado final no admite prórroga');
    }

    const previousDue = note.dueDate.toISOString().slice(0, 10);
    if (input.newDueDate <= previousDue) {
      throw new BadRequestException('La nueva fecha debe ser posterior al vencimiento actual');
    }

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const prescriptionYears = settings?.prescriptionYears ?? 3;

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const actor = ctx.actorId ?? 'system';

      await tx.noteExtension.create({
        data: {
          noteId: note.id,
          previousDue: note.dueDate,
          newDue: new Date(`${input.newDueDate}T00:00:00Z`),
          reason: input.reason,
          authorizedBy: actor,
        },
      });

      await tx.promissoryNote.update({
        where: { id: note.id },
        data: {
          dueDate: new Date(`${input.newDueDate}T00:00:00Z`),
          // La prescripción se cuenta desde el vencimiento, así que se recalcula.
          prescribesOn: new Date(`${addYears(input.newDueDate, prescriptionYears)}T00:00:00Z`),
        },
      });

      await this.audit.record(
        {
          actorId: actor,
          actorRole: ctx.actorRole,
          action: 'note.extend',
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: { previousDue, newDue: input.newDueDate, reason: input.reason },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteExtended',
        occurredAt: now,
        payload: { noteId: note.id, folio: note.folio, previousDue, newDue: input.newDueDate },
      });

      return { noteId: note.id, dueDate: input.newDueDate };
    });
  }
}
