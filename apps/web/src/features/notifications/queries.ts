import 'server-only';
import { api } from '@/shared/api/client';

export type NotificationState = 'sent' | 'pending' | 'stuck';

export interface NotificationRow {
  id: string;
  eventType: string;
  state: NotificationState;
  attempts: number;
  createdAt: string;
  publishedAt: string | null;
  /** Nulo cuando el evento resuelve el destinatario al enviarlo. */
  recipient: string | null;
  lastError: string | null;
}

export interface NotificationsView {
  stuck: NotificationRow[];
  pending: NotificationRow[];
  counts: { stuck: number; pending: number };
}

export async function getNotifications(): Promise<NotificationsView> {
  return api<NotificationsView>('/admin/notifications');
}

/**
 * Del tipo de evento al nombre que usa quien opera.
 *
 * El panel no puede enseñar `NoteIssued`: quien lo lee no sabe si eso es el
 * correo que esperaba su cliente o una entraña del sistema.
 */
export const EVENT_LABELS: Record<string, string> = {
  UserCreated: 'Acceso y contraseña temporal',
  NoteIssued: 'Pagaré por firmar',
  NoteSigned: 'Acuse de firma',
  PaymentRegistered: 'Abono registrado',
  NoteSettled: 'Pagaré liquidado',
  NoteVoided: 'Pagaré anulado',
  NoteExtended: 'Prórroga registrada',
  NoteReminderRequested: 'Recordatorio de vencimiento',
  SettlementCreated: 'Convenio registrado',
  SettlementBroken: 'Convenio incumplido',
  PasswordChanged: 'Contraseña cambiada',
  PasswordReset: 'Contraseña restablecida por la administración',
  OtpIssued: 'Código de un solo uso',
  AccountLocked: 'Cuenta bloqueada por intentos fallidos',
  RefreshReused: 'Aviso de seguridad de la sesión',
};

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}
