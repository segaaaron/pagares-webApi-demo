import { describe, expect, it } from 'vitest';
import {
  assertWrittenConfirmation,
  WrittenConfirmationMismatchError,
} from './written-confirmation.js';

describe('confirmación escrita del folio', () => {
  it('acepta el folio exacto', () => {
    expect(() => assertWrittenConfirmation('PAG-2026-000128', 'PAG-2026-000128')).not.toThrow();
  });

  it('tolera espacios y minúsculas: el descuido no es falta de intención', () => {
    expect(() => assertWrittenConfirmation('PAG-2026-000128', ' pag-2026-000128 ')).not.toThrow();
  });

  it('rechaza otro folio', () => {
    expect(() => assertWrittenConfirmation('PAG-2026-000128', 'PAG-2026-000129')).toThrow(
      WrittenConfirmationMismatchError,
    );
  });

  it('rechaza una confirmación vacía', () => {
    expect(() => assertWrittenConfirmation('PAG-2026-000128', '')).toThrow(
      WrittenConfirmationMismatchError,
    );
  });
});
