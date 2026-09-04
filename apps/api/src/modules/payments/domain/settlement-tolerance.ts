/**
 * Hasta cuándo se puede cerrar un pagaré condonando lo que falta (§25.16).
 *
 * La regla vive aquí y no dentro del caso de uso porque es la frontera entre
 * "cerrar por unos pesos de interés" y "perdonar una deuda": conviene poder
 * leerla de un vistazo y probarla sin base de datos.
 */
export type ToleranceCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'sin-saldo' | 'sin-tolerancia' | 'excede' };

export function checkSettlementTolerance(
  remainderCents: bigint,
  toleranceCents: bigint,
): ToleranceCheck {
  // Un pagaré sin saldo ya está cerrado; condonar cero asentaría una fila que no
  // significa nada y ensuciaría el libro.
  if (remainderCents <= 0n) return { ok: false, reason: 'sin-saldo' };

  // Cero es "apagado", no "sin límite". Nadie condona nada por omisión.
  if (toleranceCents <= 0n) return { ok: false, reason: 'sin-tolerancia' };

  if (remainderCents > toleranceCents) return { ok: false, reason: 'excede' };

  return { ok: true };
}
