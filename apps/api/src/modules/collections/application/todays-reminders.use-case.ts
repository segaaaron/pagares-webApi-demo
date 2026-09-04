import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, daysBetween, ruleForToday } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { SendReminderUseCase } from './send-reminder.use-case.js';
import {
  REMINDER_RULES,
  type ReminderRuleRepository,
} from '../domain/ports/reminder-rule.repository.js';

export interface ReminderCandidate {
  noteId: string;
  folio: string;
  debtorName: string;
  to: string;
  /** Días respecto al vencimiento: negativo antes, positivo en atraso. */
  offsetDays: number;
  ruleId: string;
  templateId: string;
  /** Ya salió hoy: se enseña para que la cifra del botón no mienta. */
  alreadySentToday: boolean;
}

export interface TodaysRemindersPreview {
  date: string;
  pending: ReminderCandidate[];
  alreadySent: ReminderCandidate[];
}

export interface TodaysRemindersResult {
  date: string;
  intentados: number;
  enviados: number;
  yaEstaban: number;
  fallidos: number;
  primerError: string | null;
}

/** Estados que admiten recordatorio: los demás no tienen nada que recordar. */
const OPEN = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE', 'RESTRUCTURED'] as const;

/**
 * Los avisos que tocan hoy, en una sola pasada (§13.1, §18).
 *
 * El envío por pagaré ya existía, pero obligaba a entrar en cada uno: con
 * treinta vencimientos en un día, treinta viajes. Esto los reúne y los manda
 * juntos, sin cambiar quién decide qué se manda —la regla del tramo sigue
 * eligiendo la plantilla— ni cuándo ocurre: lo dispara el administrador al
 * abrir su bandeja, no un reloj.
 *
 * Repetirlo el mismo día no duplica nada: la clave `(pagaré, regla, día)` de
 * `ReminderLog` es la que lo garantiza, y aquí sólo se cuenta lo que ya estaba.
 */
@Injectable()
export class TodaysRemindersUseCase extends BaseUseCase<
  { commit: boolean },
  TodaysRemindersPreview | TodaysRemindersResult
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendReminder: SendReminderUseCase,
    @Inject(REMINDER_RULES) private readonly rules: ReminderRuleRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(TodaysRemindersUseCase.name));
  }

  protected async handle(
    input: { commit: boolean },
    ctx: ExecutionContext,
  ): Promise<TodaysRemindersPreview | TodaysRemindersResult> {
    const today = businessToday(this.clock.now());
    const candidatos = await this.candidatos(today);

    if (!input.commit) {
      return {
        date: today,
        pending: candidatos.filter((candidato) => !candidato.alreadySentToday),
        alreadySent: candidatos.filter((candidato) => candidato.alreadySentToday),
      };
    }

    let enviados = 0;
    let yaEstaban = 0;
    let fallidos = 0;
    let primerError: string | null = null;

    for (const candidato of candidatos) {
      try {
        // Se delega en el envío de uno: la elección de plantilla, la bitácora y
        // la idempotencia viven ahí, y duplicarlas aquí sería tener dos reglas.
        const resultado = await this.sendReminder.execute({ noteId: candidato.noteId }, ctx);
        if (resultado.alreadySentToday) yaEstaban += 1;
        else enviados += 1;
      } catch (error) {
        // Un pagaré que falla no puede parar a los otros veintinueve.
        fallidos += 1;
        primerError ??= error instanceof Error ? error.message : String(error);
      }
    }

    return {
      date: today,
      intentados: candidatos.length,
      enviados,
      yaEstaban,
      fallidos,
      primerError,
    };
  }

  /**
   * Los pagarés a los que hoy les toca aviso.
   *
   * La consulta descarta lo que no admite recordatorio —liquidados, anulados y
   * los que están en juicio—, y la decisión de si toca hoy la toma la regla
   * pura de §13.1. Lo que no se puede filtrar en la base es el tramo: depende
   * de la fecha de negocio, y esa la pone el reloj inyectado.
   */
  private async candidatos(today: string): Promise<ReminderCandidate[]> {
    const reglas = (await this.rules.list()).filter((regla) => regla.channel === 'EMAIL');
    if (reglas.length === 0) return [];

    const notes = await this.prisma.promissoryNote.findMany({
      where: {
        status: { in: [...OPEN] },
        // El expediente judicial congela los avisos automáticos (§13.6).
        inLitigation: false,
      },
      select: {
        id: true,
        folio: true,
        dueDate: true,
        amountCents: true,
        paidCents: true,
        debtorId: true,
        inLitigation: true,
        debtor: { select: { fullName: true, email: true } },
        owner: { select: { email: true } },
      },
    });

    const sentOn = new Date(`${today}T00:00:00Z`);
    const candidatos: ReminderCandidate[] = [];

    for (const note of notes) {
      const balance = note.amountCents - note.paidCents;
      if (balance <= 0n) continue;

      const offsetDays = daysBetween(note.dueDate.toISOString().slice(0, 10), today);
      const regla = ruleForToday(reglas, {
        offsetDays,
        balanceCents: balance,
        debtorId: note.debtorId,
        inLitigation: note.inLitigation,
      });
      if (!regla) continue;

      // Sin correo, el recordatorio es gestión manual (§25.12): ese deudor sale
      // por la cola «sin canal automático» del panel, no por aquí.
      const to = note.debtor.email ?? note.owner?.email;
      if (!to) continue;

      candidatos.push({
        noteId: note.id,
        folio: note.folio,
        debtorName: note.debtor.fullName,
        to,
        offsetDays,
        ruleId: regla.id,
        templateId: regla.templateId,
        alreadySentToday: false,
      });
    }

    if (candidatos.length === 0) return candidatos;

    // Una sola consulta para saber cuáles ya salieron hoy, en vez de una por
    // pagaré: es la diferencia entre una consulta y treinta.
    const enviadosHoy = await this.prisma.reminderLog.findMany({
      where: {
        sentOn,
        noteId: { in: candidatos.map((candidato) => candidato.noteId) },
        status: { not: 'FAILED' },
      },
      select: { noteId: true, ruleId: true },
    });
    const yaSalio = new Set(enviadosHoy.map((fila) => `${fila.noteId}:${fila.ruleId}`));

    return candidatos.map((candidato) => ({
      ...candidato,
      alreadySentToday: yaSalio.has(`${candidato.noteId}:${candidato.ruleId}`),
    }));
  }
}
