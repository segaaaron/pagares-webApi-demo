import { Inject, Injectable } from '@nestjs/common';
import { daysBetween, ruleForToday } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
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

/** Estados que admiten recordatorio: los demás no tienen nada que recordar. */
const OPEN = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE', 'RESTRUCTURED'] as const;

/**
 * A quién le toca aviso hoy (§13.1).
 *
 * Lo usan los dos casos de uso del día —el que enseña la lista y el que la
 * manda—, y por eso vive aparte: si cada uno eligiera sus candidatos, la vista
 * previa acabaría enseñando una cosa y el botón mandando otra.
 */
@Injectable()
export class ReminderCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REMINDER_RULES) private readonly rules: ReminderRuleRepository,
  ) {}

  /**
   * La consulta descarta lo que no admite recordatorio —liquidados, anulados y
   * los que están en juicio—, y la decisión de si toca hoy la toma la regla pura
   * de §13.1. El tramo no se puede filtrar en la base: depende de la fecha de
   * negocio, y ésa la pone el reloj inyectado de quien llama.
   */
  async forDate(today: string): Promise<ReminderCandidate[]> {
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
        sentOn: new Date(`${today}T00:00:00Z`),
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
