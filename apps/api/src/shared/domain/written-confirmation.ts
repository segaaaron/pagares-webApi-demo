import { BaseDomainError } from '@pagares/api-core';
import { ERROR_CODES } from '@pagares/contracts';

/**
 * Confirmación escrita del folio (§24.5).
 *
 * Castigar y perdonar son las dos acciones con impacto económico irreversible.
 * Un diálogo con botón de "sí" se acepta por costumbre; escribir el folio
 * completo, no. Vive en `shared/domain` porque la exigen dos módulos —el castigo
 * es de `promissory-notes` y la quita de `settlements`— y la regla es una.
 *
 * Se comprueba **en el servidor**: validado sólo en el front, bastaría con
 * llamar a la API para saltárselo (§4).
 */
export class WrittenConfirmationMismatchError extends BaseDomainError {
  readonly code = ERROR_CODES.WRITTEN_CONFIRMATION_MISMATCH;
  readonly httpStatus = 422;

  constructor() {
    super('El folio que escribiste no coincide con el del pagaré', 'confirmFolio');
  }
}

export function assertWrittenConfirmation(folio: string, typed: string): void {
  // Se comparan sin espacios ni mayúsculas: el error de copiar con un espacio
  // al final no es un error de intención, y rechazarlo sólo enseña a la gente a
  // pegar el folio sin leerlo.
  const normalize = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '');
  if (normalize(folio) !== normalize(typed)) throw new WrittenConfirmationMismatchError();
}
