import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';

export class DueDateBeforeIssueDateError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.DUE_DATE_BEFORE_ISSUE_DATE;
  readonly httpStatus = 422;
  constructor() {
    super('La fecha de pago debe ser posterior a la de expedición', 'dueDate');
  }
}

export class AmountNotPositiveError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.AMOUNT_NOT_POSITIVE;
  readonly httpStatus = 422;
  constructor() {
    super('El importe debe ser mayor a cero', 'amountCents');
  }
}

export class AmountTooLargeError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.AMOUNT_TOO_LARGE;
  readonly httpStatus = 422;
  constructor() {
    super('El importe supera el máximo permitido', 'amountCents');
  }
}

export class IssueDateInFutureError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.ISSUE_DATE_IN_FUTURE;
  readonly httpStatus = 422;
  constructor() {
    super('La fecha de expedición no puede ser futura', 'issueDate');
  }
}

export class NoteNotPayableError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.NOTE_NOT_PAYABLE;
  readonly httpStatus = 409;
  constructor(status: string) {
    super(`Un pagaré en estado ${status} no admite abonos`);
  }
}

export class PaymentExceedsBalanceError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.PAYMENT_EXCEEDS_BALANCE;
  readonly httpStatus = 422;
  constructor(readonly balanceCents: bigint) {
    // El saldo real va en el mensaje: el admin necesita el número, no un "no se pudo".
    super(`El abono supera el saldo pendiente de ${(Number(balanceCents) / 100).toFixed(2)}`, 'amountCents');
  }
}

export class InvalidStatusTransitionError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.INVALID_STATUS_TRANSITION;
  readonly httpStatus = 409;
  constructor(from: string, to: string) {
    super(`No se permite pasar de ${from} a ${to}`);
  }
}

export class NoteNotFoundError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.NOT_FOUND;
  readonly httpStatus = 404;
  constructor() {
    super('El pagaré no existe');
  }
}

/**
 * No hay cifra que dar: un anulado no se debe y un renovado se debe en el
 * documento nuevo. Contestar con un número aquí sería invitar a cobrar lo que
 * no toca (§13.7).
 */
export class NoteNotSettleableError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.NOTE_NOT_PAYABLE;
  readonly httpStatus = 409;
  constructor(status: string) {
    super(
      status === 'VOID'
        ? 'El pagaré está anulado: no hay nada que liquidar'
        : 'El pagaré fue renovado: la liquidación se calcula sobre el documento nuevo',
    );
  }
}

/**
 * Simular hacia atrás daría una cifra que ya no se puede cobrar: el interés de
 * los días transcurridos no se devuelve.
 */
export class SimulationDateInPastError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.PAYMENT_DATE_INVALID;
  readonly httpStatus = 422;
  constructor() {
    super('La fecha de la simulación no puede ser anterior a hoy', 'date');
  }
}
