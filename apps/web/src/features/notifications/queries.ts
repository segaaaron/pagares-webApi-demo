import 'server-only';
import { api } from '@/shared/api/client';

export type NotificationState = 'sent' | 'pending' | 'stuck';

export interface FailureDiagnosis {
  code: string;
  /** Qué pasó, en una línea y en castellano. */
  title: string;
  /** El dato concreto: el dominio, el servidor, lo que haya que mirar. */
  detail: string | null;
  /** Qué hacer para que salga. */
  action: string;
  /** Si reintentar ahora sirve, o hay que arreglar algo antes. */
  retryHelps: boolean;
}

export interface FailureGroup {
  code: string;
  title: string;
  action: string;
  count: number;
  retryHelps: boolean;
}

export interface NotificationRow {
  id: string;
  eventType: string;
  state: NotificationState;
  attempts: number;
  createdAt: string;
  publishedAt: string | null;
  recipient: string | null;
  recipientName: string | null;
  folio: string | null;
  failure: FailureDiagnosis;
  lastError: string | null;
}

export interface NotificationsView {
  stuck: NotificationRow[];
  pending: NotificationRow[];
  counts: { stuck: number; pending: number };
  /** Los motivos agrupados: cinco filas con el mismo error son un problema. */
  causes: FailureGroup[];
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
  UserCreated: 'Contraseña temporal',
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
  PasswordReset: 'Contraseña restablecida',
  OtpIssued: 'Código de un solo uso',
  AccountLocked: 'Cuenta bloqueada',
  RefreshReused: 'Aviso de seguridad',
};

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType;
}
