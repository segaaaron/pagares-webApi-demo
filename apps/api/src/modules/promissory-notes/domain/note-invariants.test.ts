import { describe, expect, it } from 'vitest';
import { assertNoteInvariants } from './note-invariants.js';
import {
  AmountNotPositiveError,
  AmountTooLargeError,
  DueDateBeforeIssueDateError,
  IssueDateInFutureError,
} from './note.errors.js';

const today = '2026-09-30';
const draft = { amountCents: 2_500_000n, issueDate: '2026-09-30', dueDate: '2026-10-30' };

describe('invariantes del pagaré', () => {
  it('acepta un pagaré bien formado', () => {
    expect(() => assertNoteInvariants(draft, today)).not.toThrow();
  });

  it('rechaza importe cero', () => {
    expect(() => assertNoteInvariants({ ...draft, amountCents: 0n }, today)).toThrow(AmountNotPositiveError);
  });

  it('rechaza importe negativo', () => {
    expect(() => assertNoteInvariants({ ...draft, amountCents: -1n }, today)).toThrow(AmountNotPositiveError);
  });

  it('rechaza un importe absurdo por error de tecleo', () => {
    expect(() => assertNoteInvariants({ ...draft, amountCents: 10n ** 15n }, today)).toThrow(AmountTooLargeError);
  });

  it('rechaza expedición futura', () => {
    expect(() => assertNoteInvariants({ ...draft, issueDate: '2026-10-01' }, today)).toThrow(IssueDateInFutureError);
  });

  it('rechaza vencimiento anterior a la expedición', () => {
    expect(() => assertNoteInvariants({ ...draft, dueDate: '2026-09-01' }, today)).toThrow(DueDateBeforeIssueDateError);
  });

  it('rechaza vencimiento el mismo día de la expedición', () => {
    expect(() => assertNoteInvariants({ ...draft, dueDate: draft.issueDate }, today)).toThrow(DueDateBeforeIssueDateError);
  });

  it('acepta expedición pasada', () => {
    expect(() => assertNoteInvariants({ ...draft, issueDate: '2026-09-01' }, today)).not.toThrow();
  });
});
