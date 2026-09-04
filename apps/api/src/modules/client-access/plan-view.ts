import { isSigned, type NoteStatus } from '../promissory-notes/domain/note-status.js';

/** Lo mínimo de un pagaré para saber si entra en el plan y por cuánto. */
export interface PlanMember {
  status: NoteStatus;
  amountCents: bigint;
  paidCents: bigint;
  seriesId: string | null;
  seriesSize: number | null;
  planModel: string | null;
}

export interface PlanView {
  seriesId: string;
  /** Las cuotas que se pactaron, estén firmadas o no. */
  size: number;
  /** Cuántas de ellas ha firmado ya el deudor: sólo ésas forman el plan. */
  signedCount: number;
  paidCount: number;
  model: string;
  totalCents: bigint;
  paidCents: bigint;
  pendingCents: bigint;
}

/**
 * El plan de pagos tal como se le enseña al deudor (§12).
 *
 * Regla del negocio: **el plan es por folio y sólo con el folio firmado**.
 * Mientras el deudor no ha firmado una cuota, esa cuota no es deuda suya: es
 * una petición. Agruparla dentro del plan sería enseñarle como aceptado algo
 * que todavía puede rechazar, y sumarle un saldo que no debe.
 *
 * Por eso las cifras salen **sólo de lo firmado**, y `size` se manda igual con
 * el tamaño pactado: así la aplicación puede decir «3 de 12 firmados» en vez de
 * fingir que el plan tiene tres cuotas.
 *
 * Lo anulado y lo renovado quedan fuera: uno no se debe y el otro se debe en el
 * documento nuevo (§13.7).
 */
export function planOf(miembros: readonly PlanMember[]): PlanView | null {
  const primero = miembros[0];
  if (!primero?.seriesId) return null;

  const vivos = miembros.filter((n) => n.status !== 'VOID' && n.status !== 'RENEWED');
  const firmados = vivos.filter((n) => isSigned(n.status));
  if (firmados.length === 0) return null;

  const totalCents = firmados.reduce((suma, n) => suma + n.amountCents, 0n);
  const paidCents = firmados.reduce((suma, n) => suma + n.paidCents, 0n);

  return {
    seriesId: primero.seriesId,
    size: primero.seriesSize ?? vivos.length,
    signedCount: firmados.length,
    paidCount: firmados.filter((n) => n.status === 'PAID').length,
    model: primero.planModel ?? 'NONE',
    totalCents,
    paidCents,
    pendingCents: totalCents - paidCents,
  };
}
