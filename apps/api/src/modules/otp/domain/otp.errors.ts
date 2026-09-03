import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';

export class OtpInvalidError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.OTP_INVALID;
  readonly httpStatus = 422;
  constructor() {
    super('El código no es correcto', 'code');
  }
}

export class OtpExpiredError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.OTP_EXPIRED;
  readonly httpStatus = 410;
  constructor() {
    super('El código caducó. Pide uno nuevo', 'code');
  }
}

export class OtpAttemptsExceededError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.OTP_ATTEMPTS_EXCEEDED;
  readonly httpStatus = 429;
  constructor() {
    super('Demasiados intentos con este código. Pide uno nuevo', 'code');
  }
}

export class OtpCooldownError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.OTP_COOLDOWN;
  readonly httpStatus = 429;
  constructor(readonly retryAfterSeconds: number) {
    super(`Espera ${retryAfterSeconds} segundos antes de pedir otro código`);
  }
}
