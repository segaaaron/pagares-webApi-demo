import 'server-only';
import { api } from '@/shared/api/client';

export interface ReminderCandidate {
  noteId: string;
  folio: string;
  debtorName: string;
  to: string;
  /** Negativo antes del vencimiento, positivo en atraso. */
  offsetDays: number;
  ruleId: string;
  templateId: string;
  alreadySentToday: boolean;
}

export interface TodaysReminders {
  date: string;
  pending: ReminderCandidate[];
  alreadySent: ReminderCandidate[];
}

export async function getTodaysReminders(): Promise<TodaysReminders> {
  return api<TodaysReminders>('/admin/reminders/today');
}

/** «Vence en 3 días» se entiende; «offset -3» no. */
export function tramoLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Vence hoy';
  if (offsetDays < 0) {
    const dias = Math.abs(offsetDays);
    return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }
  return `${offsetDays} ${offsetDays === 1 ? 'día' : 'días'} de atraso`;
}
