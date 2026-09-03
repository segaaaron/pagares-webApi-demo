import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';

export class UnsupportedFormatError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.UNSUPPORTED_FORMAT;
  readonly httpStatus = 415;
  constructor(detected: string) {
    // El formato se lee de los bytes reales, no del Content-Type del cliente.
    super(`Formato de imagen no admitido: ${detected}`);
  }
}

export class FileTooLargeError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.SIGNATURE_TOO_LARGE;
  readonly httpStatus = 413;
  constructor(maxBytes: number) {
    super(`El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
}

export class EmptyImageError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.SIGNATURE_EMPTY;
  readonly httpStatus = 422;
  constructor() {
    // Traducción técnica de "no enviar un pagaré sin firmar".
    super('El lienzo está vacío: no contiene una firma');
  }
}
