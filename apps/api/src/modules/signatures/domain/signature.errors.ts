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

/**
 * El pagaré ya está firmado, y con otro trazo distinto del que acaba de llegar.
 *
 * Contestaba `INVALID_STATUS_TRANSITION`, cuyo mensaje —"no se permite pasar de
 * ISSUED a ISSUED"— es la máquina de estados hablando de sí misma: el deudor
 * leía que su firma había fallado cuando en realidad ya estaba guardada, y
 * volvía a intentarlo. Lo que hay que decir es lo que pasó.
 */
export class NoteAlreadySignedError extends BaseDomainError {
  readonly code: ErrorCode = ERROR_CODES.NOTE_ALREADY_SIGNED;
  readonly httpStatus = 409;
  constructor() {
    super('Este pagaré ya está firmado: no hace falta volver a firmarlo');
  }
}
