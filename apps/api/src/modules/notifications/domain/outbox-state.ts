/**
 * Estado de un aviso del outbox (§3.3, §18.1).
 *
 * El despacho reintenta sólo mientras queden intentos. Pasado ese tope, la fila
 * deja de tocarse: no es que vaya a salir más tarde, es que no va a salir nunca.
 * Distinguir las dos situaciones es lo que permite enseñarlas por separado en el
 * panel, y lo que evita que un correo se pierda en silencio.
 */
export const MAX_ATTEMPTS = 3;

export type OutboxState = 'sent' | 'pending' | 'stuck';

export interface OutboxRow {
  publishedAt: Date | null;
  attempts: number;
}

export function outboxState(row: OutboxRow): OutboxState {
  if (row.publishedAt !== null) return 'sent';
  return row.attempts >= MAX_ATTEMPTS ? 'stuck' : 'pending';
}

/**
 * Reintentar tiene sentido en todo lo que no haya salido.
 *
 * Lo atascado porque nadie más lo va a intentar; lo pendiente porque forzarlo
 * sólo adelanta un intento que iba a ocurrir igual. Lo ya entregado no se toca:
 * sería mandarle el mismo correo dos veces al deudor.
 */
export function isRetryable(row: OutboxRow): boolean {
  return row.publishedAt === null;
}

/**
 * El destinatario, cuando el evento lo lleva encima.
 *
 * Algunos avisos —el de sesión reutilizada, por ejemplo— sólo traen el usuario y
 * el correo se resuelve al enviarlo. En esos casos se devuelve nulo: el panel
 * dice «no consta» en vez de inventarse una dirección.
 */
export function recipientOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const email = (payload as Record<string, unknown>)['email'];
  return typeof email === 'string' && email.length > 0 ? email : null;
}
