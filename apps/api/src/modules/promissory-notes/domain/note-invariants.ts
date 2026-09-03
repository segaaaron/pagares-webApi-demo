import { MAX_AMOUNT_CENTS } from '@pagares/domain-rules';
import {
  AmountNotPositiveError,
  AmountTooLargeError,
  DueDateBeforeIssueDateError,
  IssueDateInFutureError,
} from './note.errors.js';

export interface NoteDraft {
  readonly amountCents: bigint;
  readonly issueDate: string;
  readonly dueDate: string;
}

/**
 * Invariantes del pagaré (art. 170 LGTOC). Se comprueban aquí una vez, sin HTTP
 * ni base de datos, de modo que puedan probarse en milisegundos.
 */
export function assertNoteInvariants(draft: NoteDraft, today: string): void {
  if (draft.amountCents <= 0n) throw new AmountNotPositiveError();
  if (draft.amountCents > MAX_AMOUNT_CENTS) throw new AmountTooLargeError();

  // Firmar hoy un documento fechado mañana es una inconsistencia que nadie corrige.
  if (draft.issueDate > today) throw new IssueDateInFutureError();

  // Un vencimiento anterior o igual a la expedición lo haría exigible desde su origen.
  if (draft.dueDate <= draft.issueDate) throw new DueDateBeforeIssueDateError();
}
