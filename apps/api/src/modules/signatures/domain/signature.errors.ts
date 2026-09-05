import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES, type ErrorCode } from '@pagares/contracts';

/**
 * La misma firma no vale para dos pagarés (ADR 0021).
 *
 * Cada título se firma por separado y con su propio trazo: es lo que hace que
 * un pagaré presentado solo ante un juez no admita discusión. Dos documentos
 * con la **misma imagen al byte** no son dos firmas, son una copiada — y nadie
 * dibuja dos veces exactamente lo mismo, así que cuando pasa es que se reenvió
 * el trazo anterior.
 */
export class SignatureReusedError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.SIGNATURE_REUSED;
  readonly httpStatus = 409;
  constructor(readonly folio: string) {
    super(
      `Esa firma ya se usó en el pagaré ${folio}. Cada pagaré se firma por separado, ` +
        'con su propio trazo',
    );
  }
}
