import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { businessToday, daysBetween, ruleForToday } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import {
  REMINDER_RULES,
  type ReminderRuleRepository,
} from '../domain/ports/reminder-rule.repository.js';

export interface SendReminderOutput {
  sentTo: string;
  templateId: string;
  /** `true` cuando el aviso ya se había mandado hoy con esa misma regla. */
  alreadySentToday: boolean;
}

/**
 * Recordatorio de pago, a petición del administrador (§18).
 *
 * No hay cron que los mande solos: se envían cuando alguien decide que toca. La
 * plantilla no la elige quien pulsa el botón, la elige la regla del tramo
 * (§13.1), y el envío queda anotado en `ReminderLog` con su clave
 * `(pagaré, regla, día)`: pulsar dos veces el mismo día no manda dos correos.
 */
@Injectable()
export class SendReminderUseCase extends BaseUseCase<{ noteId: string }, SendReminderOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(REMINDER_RULES) private readonly rules: ReminderRuleRepository,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(SendReminderUseCase.name));
  }

  protected async handle(
    input: { noteId: string },
    ctx: ExecutionContext,
  ): Promise<SendReminderOutput> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      include: { debtor: true, owner: true },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const to = note.debtor.email ?? note.owner?.email ?? null;
    if (!to) {
      // Sin correo el recordatorio es gestión manual (§25.12); decirlo es más
      // útil que fingir un envío que nunca ocurrió.
      throw new BadRequestException(
        'Este deudor no tiene correo: el recordatorio hay que darlo por WhatsApp o teléfono',
      );
    }
    if (note.paidCents >= note.amountCents) {
      throw new BadRequestException('El pagaré ya está liquidado');
    }

    const now = this.clock.now();
    const today = businessToday(now);
    const offsetDays = daysBetween(note.dueDate.toISOString().slice(0, 10), today);

    const rules = await this.rules.list();
    const rule = ruleForToday(
      rules.filter((candidate) => candidate.channel === 'EMAIL'),
      {
        offsetDays,
        balanceCents: note.amountCents - note.paidCents,
        debtorId: note.debtorId,
        inLitigation: note.inLitigation,
      },
    );

    if (!rule) {
      throw new BadRequestException(
        note.inLitigation
          ? 'El expediente judicial congela los avisos automáticos de este pagaré'
          : 'Ninguna regla de recordatorio aplica hoy a este pagaré: revísalas en Ajustes',
      );
    }

    const sentOn = new Date(`${today}T00:00:00Z`);

    // Fuera de la transacción: si ya se mandó hoy, no hay nada que escribir.
    const already = await this.prisma.reminderLog.findUnique({
      where: { noteId_ruleId_sentOn: { noteId: note.id, ruleId: rule.id, sentOn } },
    });

    // Un intento fallido **sí** se puede repetir el mismo día: lo que la clave
    // única evita es mandar dos veces el mismo aviso, no impedir el reintento de
    // uno que nunca llegó a salir (§13.1).
    if (already && already.status !== 'FAILED') {
      return { sentTo: to, templateId: rule.templateId, alreadySentToday: true };
    }

    return this.uow.run(async (scope) => {
      // La clave única `(noteId, ruleId, sentOn)` es la que hace idempotente el
      // envío: dos peticiones simultáneas se resuelven en la base, no aquí. El
      // `upsert` es para el reintento de un envío fallido, que reusa la fila.
      await scope.client.reminderLog.upsert({
        where: { noteId_ruleId_sentOn: { noteId: note.id, ruleId: rule.id, sentOn } },
        create: {
          noteId: note.id,
          ruleId: rule.id,
          sentOn,
          channel: 'EMAIL',
          status: 'QUEUED',
        },
        update: { status: 'QUEUED', error: null, messageId: null },
      });

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'note.reminder',
          targetType: 'PromissoryNote',
          targetId: note.id,
          metadata: { to, offsetDays, ruleId: rule.id, templateId: rule.templateId },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        scope.client,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteReminderRequested',
        occurredAt: now,
        payload: {
          noteId: note.id,
          folio: note.folio,
          offsetDays,
          ruleId: rule.id,
          templateId: rule.templateId,
        },
      });

      return { sentTo: to, templateId: rule.templateId, alreadySentToday: false };
    });
  }
}
