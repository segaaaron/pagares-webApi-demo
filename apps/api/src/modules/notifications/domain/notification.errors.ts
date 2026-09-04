import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';
import type { OutboxState } from './outbox-state.js';

/**
 * Reenviar un aviso que ya salió (§18.1).
 *
 * No es un error del sistema sino una petición imposible de cumplir sin hacer
 * daño: el deudor recibiría dos veces el mismo correo, y con un recibo o una
 * contraseña temporal dentro eso confunde de verdad.
 */
export class AlreadyDeliveredError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.NOTIFICATION_ALREADY_DELIVERED;
  readonly httpStatus = 409;
  constructor(readonly state: OutboxState) {
    super('Ese aviso ya se entregó; reenviarlo mandaría el mismo correo dos veces');
  }
}
