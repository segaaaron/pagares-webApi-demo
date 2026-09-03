import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';

export class SettlementAlreadyActiveError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.SETTLEMENT_ALREADY_ACTIVE;
  readonly httpStatus = 409;
  constructor() {
    super('El pagaré ya tiene un convenio vigente');
  }
}

export class ForgivenessExceedsBalanceError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.FORGIVENESS_EXCEEDS_BALANCE;
  readonly httpStatus = 422;
  constructor(readonly balanceCents: bigint) {
    super(
      `Lo convenido más la quita no puede superar el saldo de ${(Number(balanceCents) / 100).toFixed(2)}`,
      'agreedCents',
    );
  }
}

export class SettlementExpiredError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.SETTLEMENT_EXPIRED;
  readonly httpStatus = 409;
  constructor() {
    super('El convenio ya venció o fue cerrado');
  }
}
