import { classifyAging, classifyPortfolio, type AgingBucket, type PortfolioClass } from '@pagares/domain-rules';

/**
 * Estados del pagaré y sus transiciones (§11).
 * Esta es la única tabla: el caso de uso no acepta nada que no esté aquí.
 */
export type NoteStatus =
  | 'PENDING_SIGNATURE'
  | 'PROCESSING_SIGNATURE'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'OVERDUE'
  | 'PAID'
  | 'RESTRUCTURED'
  | 'RENEWED'
  | 'WRITTEN_OFF'
  | 'VOID';

/**
 * Aplica el reloj al estado guardado (§11.2). La única transición que depende
 * del tiempo y no de un evento es pasar a `OVERDUE`, y no hay proceso nocturno
 * que la escriba: se resuelve aquí, al leer, para que la columna `status` y lo
 * que ve el usuario nunca se contradigan.
 */
export function withClock(stored: NoteStatus, daysOverdue: number): NoteStatus {
  if (daysOverdue <= 0) return stored;
  return stored === 'ISSUED' || stored === 'PARTIALLY_PAID' ? 'OVERDUE' : stored;
}

/** Estados finales: no admiten más transiciones ni abonos. */
export const FINAL_STATUSES: ReadonlySet<NoteStatus> = new Set(['PAID', 'RENEWED', 'VOID']);

const TRANSITIONS: Readonly<Record<NoteStatus, readonly NoteStatus[]>> = {
  PENDING_SIGNATURE: ['PROCESSING_SIGNATURE', 'VOID'],
  // Si el pipeline de firma falla, vuelve a pendiente y se avisa (§8.2).
  PROCESSING_SIGNATURE: ['ISSUED', 'PENDING_SIGNATURE', 'VOID'],
  ISSUED: ['PARTIALLY_PAID', 'OVERDUE', 'PAID', 'RESTRUCTURED', 'RENEWED', 'WRITTEN_OFF', 'VOID'],
  PARTIALLY_PAID: ['OVERDUE', 'PAID', 'RESTRUCTURED', 'RENEWED', 'WRITTEN_OFF', 'VOID'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'RESTRUCTURED', 'RENEWED', 'WRITTEN_OFF', 'VOID'],
  RESTRUCTURED: ['PAID', 'ISSUED', 'PARTIALLY_PAID', 'WRITTEN_OFF', 'VOID'],
  // Sólo se sale del castigo revirtiéndolo con motivo; un abono NO lo revierte.
  WRITTEN_OFF: ['ISSUED', 'PARTIALLY_PAID'],
  PAID: [],
  RENEWED: [],
  VOID: [],
};

export function canTransition(from: NoteStatus, to: NoteStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: NoteStatus): readonly NoteStatus[] {
  return TRANSITIONS[from];
}

/** Un pagaré admite abonos salvo en los finales; sobre castigado, como recuperación. */
export function acceptsPayments(status: NoteStatus): boolean {
  return !FINAL_STATUSES.has(status) && status !== 'PENDING_SIGNATURE' && status !== 'PROCESSING_SIGNATURE';
}

export interface DerivationInput {
  readonly amountCents: bigint;
  readonly paidCents: bigint;
  readonly daysOverdue: number;
  readonly hasSignature: boolean;
  readonly signatureProcessing: boolean;
  readonly voidedAt: Date | null;
  readonly writtenOffAt: Date | null;
  readonly renewedById: string | null;
  readonly hasActiveSettlement: boolean;
}

export interface DerivedState {
  readonly status: NoteStatus;
  readonly portfolioClass: PortfolioClass;
  readonly agingBucket: AgingBucket;
  readonly balanceCents: bigint;
}

/**
 * El estado se deriva; no se teclea (§11.2).
 * Primero mandan las marcas explícitas del administrador, luego el saldo y el reloj.
 */
export function deriveState(input: DerivationInput): DerivedState {
  const balanceCents = input.amountCents - input.paidCents;
  const portfolioClass = classifyPortfolio(input.daysOverdue);
  const agingBucket = classifyAging(input.daysOverdue);
  const base = { portfolioClass, agingBucket, balanceCents };

  if (input.voidedAt !== null) return { ...base, status: 'VOID' };
  if (input.writtenOffAt !== null) return { ...base, status: 'WRITTEN_OFF' };
  if (input.renewedById !== null) return { ...base, status: 'RENEWED' };
  if (!input.hasSignature) {
    return { ...base, status: input.signatureProcessing ? 'PROCESSING_SIGNATURE' : 'PENDING_SIGNATURE' };
  }
  if (balanceCents <= 0n) return { ...base, status: 'PAID' };
  if (input.hasActiveSettlement) return { ...base, status: 'RESTRUCTURED' };

  // OVERDUE gana sobre PARTIALLY_PAID: un vencido con abonos sigue siendo un
  // vencido, que es lo que el administrador necesita ver primero.
  if (input.daysOverdue > 0) return { ...base, status: 'OVERDUE' };
  if (input.paidCents > 0n) return { ...base, status: 'PARTIALLY_PAID' };
  return { ...base, status: 'ISSUED' };
}
