/**
 * Catálogos cerrados de motivos (§11.3).
 *
 * Anular y castigar son las dos acciones con impacto económico irreversible, así
 * que el motivo no es texto libre: se elige de una lista y se acompaña de una
 * nota. Un catálogo permite además contarlos en los reportes.
 */
export const VOID_REASONS = {
  capture_error: 'Error de captura',
  duplicate: 'Emitido por duplicado',
  not_delivered: 'El crédito no se entregó',
  agreement: 'Cancelado de común acuerdo',
  other: 'Otro motivo',
} as const;

export const WRITE_OFF_REASONS = {
  uncollectible: 'Incobrable tras gestión agotada',
  debtor_untraceable: 'Deudor ilocalizable',
  cost_exceeds_debt: 'El costo de cobro supera el adeudo',
  legal_advice: 'Recomendación legal',
  other: 'Otro motivo',
} as const;

export type VoidReasonCode = keyof typeof VOID_REASONS;
export type WriteOffReasonCode = keyof typeof WRITE_OFF_REASONS;

export function isVoidReason(code: string): code is VoidReasonCode {
  return Object.hasOwn(VOID_REASONS, code);
}

export function isWriteOffReason(code: string): code is WriteOffReasonCode {
  return Object.hasOwn(WRITE_OFF_REASONS, code);
}
