/**
 * Clasificación de cartera (§11.1). Tres conceptos distintos que NO son sinónimos:
 *
 *   · status         → qué es el documento hoy
 *   · portfolioClass → cómo cuenta el saldo: cartera vencida son 90 días naturales
 *   · agingBucket    → el tramo de antigüedad, para el reporte
 *
 * Un pagaré con 10 días de atraso está vencido, pero su saldo sigue en cartera
 * VIGENTE. Mezclarlos deforma todos los indicadores.
 */
export type PortfolioClass = 'VIGENTE' | 'VENCIDA';
export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D91_120' | 'D120_PLUS';
export type CollectionStage =
  | 'PREVENTIVA'
  | 'ADMINISTRATIVA'
  | 'EXTRAJUDICIAL'
  | 'JUDICIAL'
  | 'CASTIGO';

/** Umbral contable mexicano: 90 días naturales sin pago. */
export const OVERDUE_PORTFOLIO_THRESHOLD_DAYS = 90;

export function classifyPortfolio(daysOverdue: number): PortfolioClass {
  return daysOverdue >= OVERDUE_PORTFOLIO_THRESHOLD_DAYS ? 'VENCIDA' : 'VIGENTE';
}

export function classifyAging(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return 'D1_30';
  if (daysOverdue <= 60) return 'D31_60';
  if (daysOverdue <= 90) return 'D61_90';
  if (daysOverdue <= 120) return 'D91_120';
  return 'D120_PLUS';
}

/**
 * Etapa sugerida. Se sugiere, no se impone: un deudor que responde no debe
 * escalar a judicial por calendario, y por eso existe `stageFrozen`.
 */
export function suggestStage(daysOverdue: number, daysToDue: number): CollectionStage {
  if (daysOverdue >= OVERDUE_PORTFOLIO_THRESHOLD_DAYS) return 'JUDICIAL';
  if (daysOverdue > 30) return 'EXTRAJUDICIAL';
  if (daysOverdue > 0) return 'ADMINISTRATIVA';
  if (daysToDue <= 7) return 'PREVENTIVA';
  return 'PREVENTIVA';
}
