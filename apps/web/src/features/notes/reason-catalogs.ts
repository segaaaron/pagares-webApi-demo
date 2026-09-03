/**
 * Catálogos de motivo (§11.3), en un módulo normal.
 *
 * No pueden vivir en el archivo de Server Actions: un módulo `'use server'` sólo
 * puede exportar funciones asíncronas, y una constante exportada desde ahí llega
 * al cliente como algo que no se puede recorrer.
 */
export const VOID_REASONS = [
  { code: 'capture_error', label: 'Error de captura' },
  { code: 'duplicate', label: 'Emitido por duplicado' },
  { code: 'not_delivered', label: 'El crédito no se entregó' },
  { code: 'agreement', label: 'Cancelado de común acuerdo' },
  { code: 'other', label: 'Otro motivo' },
] as const;

export const WRITE_OFF_REASONS = [
  { code: 'uncollectible', label: 'Incobrable tras gestión agotada' },
  { code: 'debtor_untraceable', label: 'Deudor ilocalizable' },
  { code: 'cost_exceeds_debt', label: 'El costo de cobro supera el adeudo' },
  { code: 'legal_advice', label: 'Recomendación legal' },
  { code: 'other', label: 'Otro motivo' },
] as const;
