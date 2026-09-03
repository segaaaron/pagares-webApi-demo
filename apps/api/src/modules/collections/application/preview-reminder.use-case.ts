import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, daysBetween, formatMxn } from '@pagares/domain-rules';
import { renderReminder, type DocumentCardData } from '@pagares/emails';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import { MAILER, type Mailer } from '../../notifications/domain/ports/mailer.js';
import {
  REMINDER_RULES,
  type ReminderRuleRepository,
} from '../domain/ports/reminder-rule.repository.js';

export interface PreviewReminderInput {
  ruleId: string;
  /** Con un pagaré real la vista previa dice cifras reales; sin él, de muestra. */
  noteId?: string | undefined;
  /** Manda el correo de prueba a esta dirección, normalmente la del admin. */
  sendTestTo?: string | undefined;
}

export interface PreviewReminderOutput {
  subject: string;
  html: string;
  text: string;
  sentTo: string | null;
}

const LONG_DATE = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Vista previa y envío de prueba de una regla de recordatorio (§24.5).
 *
 * Pasa por la misma función de plantilla que el envío real: si la vista previa
 * dibujara el correo por su cuenta, se separarían al primer cambio de texto y
 * dejaría de servir para lo único que sirve —ver qué le va a llegar al cliente
 * antes de activar la regla.
 */
@Injectable()
export class PreviewReminderUseCase extends BaseUseCase<PreviewReminderInput, PreviewReminderOutput> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REMINDER_RULES) private readonly rules: ReminderRuleRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(PreviewReminderUseCase.name));
  }

  protected async handle(
    input: PreviewReminderInput,
    _ctx: ExecutionContext,
  ): Promise<PreviewReminderOutput> {
    const rule = await this.rules.byId(input.ruleId);
    if (!rule) throw new NotFoundException('La regla no existe');
    if (rule.channel !== 'EMAIL') {
      throw new BadRequestException(
        'Sólo las reglas de correo tienen vista previa: WhatsApp se manda a mano desde el detalle',
      );
    }

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
    });
    const organizationName = settings?.legalName ?? 'Pagarés';
    const now = this.clock.now();

    const { document, fullName, offsetDays } = input.noteId
      ? await this.fromNote(input.noteId, now)
      : this.sample(rule.offsetDays, organizationName);

    const mail = renderReminder(rule.templateId, {
      organizationName,
      fullName,
      offsetDays,
      document,
      appUrl: this.env.WEB_URL,
    });

    if (input.sendTestTo) {
      await this.mailer.send({
        // Se marca como prueba en el asunto: un correo de prueba que parece real
        // acaba reenviado a un cliente.
        to: input.sendTestTo,
        subject: `[PRUEBA] ${mail.subject}`,
        html: mail.html,
        text: `[PRUEBA]\n\n${mail.text}`,
        meta: { templateId: rule.templateId },
      });
    }

    return { ...mail, sentTo: input.sendTestTo ?? null };
  }

  private async fromNote(
    noteId: string,
    now: Date,
  ): Promise<{ document: DocumentCardData; fullName: string; offsetDays: number }> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: noteId },
      include: { debtor: true },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const dueDate = note.dueDate.toISOString().slice(0, 10);
    return {
      fullName: note.debtor.fullName,
      offsetDays: daysBetween(dueDate, businessToday(now)),
      document: {
        folio: note.folio,
        amountFormatted: formatMxn(note.amountCents),
        amountInWords: note.amountInWords,
        balanceFormatted: formatMxn(note.amountCents - note.paidCents),
        dueDateFormatted: LONG_DATE.format(note.dueDate),
        creditorName: note.creditorName,
        statusLabel: 'Vista previa',
        statusTone: 'neutral',
      },
    };
  }

  /** Datos de muestra: la regla se puede revisar antes de que exista la cartera. */
  private sample(
    offsetDays: number,
    creditorName: string,
  ): { document: DocumentCardData; fullName: string; offsetDays: number } {
    return {
      fullName: 'Nombre del deudor',
      offsetDays,
      document: {
        folio: 'PAG-2026-000000',
        amountFormatted: formatMxn(25_000_00n),
        amountInWords: 'VEINTICINCO MIL PESOS 00/100 M.N.',
        balanceFormatted: formatMxn(15_000_00n),
        dueDateFormatted: '30 de septiembre de 2026',
        creditorName,
        statusLabel: 'Ejemplo',
        statusTone: 'neutral',
      },
    };
  }
}
