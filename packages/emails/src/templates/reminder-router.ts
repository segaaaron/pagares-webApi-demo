import { dueReminder, type DueReminderData } from './due-reminder.js';
import { promiseReminder } from './collections.js';

/** Las plantillas que una regla de recordatorio puede usar (§13.1). */
export const REMINDER_TEMPLATE_IDS = ['due-reminder', 'overdue-notice', 'promise-reminder'] as const;

export type ReminderTemplateId = (typeof REMINDER_TEMPLATE_IDS)[number];

export interface ReminderRenderData extends DueReminderData {
  /** Sólo lo usa `promise-reminder`; el resto lo ignora. */
  promisedOnFormatted?: string | undefined;
}

/**
 * Resuelve la plantilla de un recordatorio por su identificador (§13.1).
 *
 * Existe para que el dashboard pueda **previsualizar exactamente** lo que va a
 * salir: si la vista previa lo dibujara por su cuenta, el correo de prueba y el
 * de verdad se separarían al primer cambio de copy, que es justo lo que la
 * vista previa debía evitar.
 *
 * `due-reminder` y `overdue-notice` comparten función a propósito: el documento
 * es el mismo y lo que cambia es el tono, decidido por `offsetDays` (§16, 7 y 8).
 */
export function renderReminder(
  templateId: string,
  data: ReminderRenderData,
): { subject: string; html: string; text: string } {
  switch (templateId) {
    case 'promise-reminder':
      return promiseReminder({
        organizationName: data.organizationName,
        fullName: data.fullName,
        document: data.document,
        appUrl: data.appUrl,
        promisedOnFormatted: data.promisedOnFormatted ?? data.document.dueDateFormatted,
      });
    case 'overdue-notice':
      // El tono de atraso lo fija el offset; forzarlo aquí sería mentir si la
      // regla se colgó de un día que todavía no ha vencido.
      return dueReminder({ ...data, offsetDays: Math.max(1, data.offsetDays) });
    case 'due-reminder':
      return dueReminder(data);
    default:
      throw new Error(`La plantilla ${templateId} no es un recordatorio`);
  }
}
