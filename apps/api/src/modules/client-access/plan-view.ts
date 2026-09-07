import { applyToSchedule } from '@pagares/domain-rules';
import { isSigned, type NoteStatus } from '../promissory-notes/domain/note-status.js';

/** Una cuota tal como está guardada. */
export interface PlanInstallment {
  index: number;
  dueOn: Date;
  amountCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
}

/** Lo mínimo de un pagaré para saber si tiene plan y cómo va. */
export interface PlanMember {
  status: NoteStatus;
  amountCents: bigint;
  paidCents: bigint;
  planModel: string | null;
  planPrincipalCents: bigint | null;
  planInterestCents: bigint | null;
  installments: PlanInstallment[];
}

export interface PlanView {
  /** Cuántas cuotas se pactaron. */
  size: number;
  /** Cuántas están saldadas al céntimo. */
  paidCount: number;
  model: string;
  /** Lo que el título exige: capital más el interés ordinario pactado. */
  totalCents: bigint;
  /** Lo prestado. */
  principalCents: bigint;
  /** El precio del préstamo. */
  interestCents: bigint;
  paidCents: bigint;
  pendingCents: bigint;
  /** La cuota que toca ahora, o nulo si ya están todas cubiertas. */
  nextDueOn: string | null;
  nextAmountCents: bigint | null;
  /**
   * El calendario cuota a cuota, que es lo que el deudor firmó.
   *
   * Se calculaba aquí para saber cuánto queda y se tiraba: la aplicación podía
   * decir "3 cuotas, 1 pagada" pero no cuándo caen las otras dos ni por cuánto.
   * Con una cuota por pagaré esas fechas se veían solas —cada título tenía la
   * suya—; al juntar la deuda en un solo título, esconderlas dejó al deudor sin
   * saber qué le toca pagar y qué día.
   */
  rows: {
    index: number;
    dueOn: string;
    amountCents: bigint;
    interestCents: bigint;
    principalCents: bigint;
    paidCents: bigint;
    balanceCents: bigint;
    /** PAID, PARTIAL o PENDING: se deriva de lo abonado, no se teclea. */
    status: string;
  }[];
}

/**
 * El plan de pagos tal como se le enseña al deudor (§12, ADR 0022).
 *
 * Es **un** pagaré con su tabla de amortización, así que el plan existe cuando
 * el título está firmado y no existe cuando no lo está: mientras el deudor no
 * firma, lo que hay es una petición, y enseñarle un plan sería darle por
 * aceptado algo que todavía puede rechazar.
 *
 * Ésta es la simplificación que trajo el pagaré único: antes había que contar
 * cuántas cuotas de una serie estaban firmadas y enseñar el resto como folios
 * sueltos. Una firma, un plan.
 *
 * Lo anulado y lo renovado no tienen plan: uno no se debe y el otro se debe en
 * el documento nuevo (§13.7).
 */
export function planOf(note: PlanMember): PlanView | null {
  if (note.installments.length === 0) return null;
  if (note.status === 'VOID' || note.status === 'RENEWED') return null;
  if (!isSigned(note.status)) return null;

  const cuotas = applyToSchedule(
    note.installments.map((cuota) => ({
      index: cuota.index,
      dueOn: cuota.dueOn.toISOString().slice(0, 10),
      amountCents: cuota.amountCents,
      interestCents: cuota.interestCents,
      principalCents: cuota.principalCents,
    })),
    note.paidCents,
  );

  const siguiente = cuotas.find((cuota) => cuota.status !== 'PAID') ?? null;

  return {
    size: cuotas.length,
    paidCount: cuotas.filter((cuota) => cuota.status === 'PAID').length,
    model: note.planModel ?? 'NONE',
    totalCents: note.amountCents,
    principalCents: note.planPrincipalCents ?? note.amountCents,
    interestCents: note.planInterestCents ?? 0n,
    paidCents: note.paidCents,
    pendingCents: note.amountCents - note.paidCents,
    nextDueOn: siguiente?.dueOn ?? null,
    // Lo que falta de la cuota en curso, no su importe entero: si ya lleva la
    // mitad abonada, decirle que debe el total sería cobrarle dos veces.
    nextAmountCents: siguiente?.balanceCents ?? null,
    rows: cuotas.map((cuota) => ({
      index: cuota.index,
      dueOn: cuota.dueOn,
      amountCents: cuota.amountCents,
      interestCents: cuota.interestCents,
      principalCents: cuota.principalCents,
      paidCents: cuota.paidCents,
      balanceCents: cuota.balanceCents,
      status: cuota.status,
    })),
  };
}
