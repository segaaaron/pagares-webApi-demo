import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';

/** Política de §10.2: 12 caracteres, sin caducidad forzada (NIST SP 800-63B). */
export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_HISTORY_SIZE = 5;
export const MAX_CHANGES_PER_WINDOW = 3;
export const CHANGE_WINDOW_DAYS = 7;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_HOURS = 5;
export const TEMP_PASSWORD_HOURS = 72;

export class PasswordTooWeakError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.PASSWORD_TOO_WEAK;
  readonly httpStatus = 422;
  constructor(reason: string) {
    super(reason, 'newPassword');
  }
}

export class PasswordReusedError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.PASSWORD_REUSED;
  readonly httpStatus = 422;
  constructor() {
    super('No puedes reutilizar ninguna de tus últimas 5 contraseñas', 'newPassword');
  }
}

export class PasswordChangeLimitError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.PASSWORD_CHANGE_LIMIT_REACHED;
  readonly httpStatus = 429;
  constructor(readonly availableAt: Date) {
    super(
      `Alcanzaste el máximo de ${MAX_CHANGES_PER_WINDOW} cambios por semana. Podrás cambiarla de nuevo el ${availableAt.toISOString().slice(0, 10)}`,
    );
  }
}

/** Validación de forma. La comprobación contra filtradas ocurre en el servicio. */
export function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordTooWeakError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    );
  }
  if (/^(.)\1+$/.test(password)) {
    throw new PasswordTooWeakError('La contraseña no puede ser un solo carácter repetido');
  }
}

/**
 * Cuota de cambios (§10.2). Un reset del administrador la pone a cero y no la
 * consume: si el admin interviene es porque el usuario está atascado, y dejarlo
 * sin cuota lo devolvería al mismo problema.
 */
export function assertChangeQuota(changesInWindow: Date[], now: Date): void {
  const windowStart = new Date(now.getTime() - CHANGE_WINDOW_DAYS * 86_400_000);
  const recent = changesInWindow.filter((d) => d > windowStart).sort((a, b) => a.getTime() - b.getTime());
  if (recent.length < MAX_CHANGES_PER_WINDOW) return;

  const oldest = recent[0];
  if (!oldest) return;
  throw new PasswordChangeLimitError(new Date(oldest.getTime() + CHANGE_WINDOW_DAYS * 86_400_000));
}

/** Bloqueo por intentos: por cuenta, no por IP (§10.2). */
export function nextLockout(failedCount: number, now: Date): Date | null {
  return failedCount >= MAX_FAILED_LOGINS
    ? new Date(now.getTime() + LOCKOUT_HOURS * 3_600_000)
    : null;
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil > now;
}
