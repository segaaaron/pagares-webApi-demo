import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';

export class InvalidCredentialsError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.INVALID_CREDENTIALS;
  readonly httpStatus = 401;
  constructor() {
    // Mismo mensaje exista o no la cuenta: distinguirlos permite enumerar usuarios.
    super('Correo o contraseña incorrectos');
  }
}

export class AccountLockedError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.ACCOUNT_LOCKED;
  readonly httpStatus = 423;
  constructor(readonly retryAfterSeconds: number) {
    super('La cuenta está bloqueada temporalmente por intentos fallidos');
  }
}

export class TempPasswordExpiredError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.TEMP_PASSWORD_EXPIRED;
  readonly httpStatus = 410;
  constructor() {
    super('La contraseña temporal caducó. Pide al administrador que la genere de nuevo');
  }
}

export class RefreshReusedError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.REFRESH_REUSED;
  readonly httpStatus = 401;
  constructor() {
    super('Sesión inválida. Vuelve a iniciar sesión');
  }
}
