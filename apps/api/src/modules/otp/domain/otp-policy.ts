/** Parámetros del OTP (§10.2). Un código corto exige límites estrictos. */
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_PER_HOUR = 5;

export interface OtpState {
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export type OtpCheck = 'ok' | 'expired' | 'attempts-exceeded';

/**
 * Estado de un código antes de compararlo.
 *
 * Se comprueba caducidad e intentos **antes** de mirar el valor: así un atacante
 * no puede distinguir "código incorrecto" de "código caducado" gastando intentos.
 */
export function checkOtpState(state: OtpState, now: Date): OtpCheck {
  if (state.consumedAt !== null || state.expiresAt < now) return 'expired';
  if (state.attempts >= OTP_MAX_ATTEMPTS) return 'attempts-exceeded';
  return 'ok';
}

export function cooldownRemaining(lastIssuedAt: Date | null, now: Date): number {
  if (!lastIssuedAt) return 0;
  const elapsed = Math.floor((now.getTime() - lastIssuedAt.getTime()) / 1000);
  return Math.max(0, OTP_RESEND_COOLDOWN_SECONDS - elapsed);
}
