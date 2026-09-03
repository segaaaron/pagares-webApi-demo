/**
 * Interés moratorio, art. 174 LGTOC (§12.3).
 * Simple, no capitalizable, sobre el saldo y por día natural desde el día
 * siguiente al vencimiento. El resultado se trunca a centavos.
 */
export type DayCountBasis = 360 | 365;

export interface AccrueInterestInput {
  balanceCents: bigint;
  annualRatePct: number | null; // null = sin intereses pactados; 0 = pactados en cero
  daysOverdue: number;
  basis: DayCountBasis;
}

export function accrueInterest({
  balanceCents,
  annualRatePct,
  daysOverdue,
  basis,
}: AccrueInterestInput): bigint {
  if (annualRatePct === null || annualRatePct === 0) return 0n;
  if (daysOverdue <= 0 || balanceCents <= 0n) return 0n;

  // Escala a enteros para no perder centavos por redondeo binario.
  const SCALE = 1_000_000n;
  const rate = BigInt(Math.round(annualRatePct * 10_000)); // pct con 4 decimales
  const numerator = balanceCents * rate * BigInt(daysOverdue) * SCALE;
  const denominator = 1_000_000n * BigInt(basis); // 10_000 (pct) * 100 (porcentaje)
  return numerator / denominator / SCALE;
}

/**
 * Cómo se pactó la tasa moratoria.
 *
 * En México se pacta indistintamente **por mes** o **por año**, y en la
 * práctica lo más común en pagarés entre particulares es mensual ("3% mensual").
 * El documento debe decirlo como se firmó; el cálculo, en cambio, necesita una
 * sola unidad. Por eso se guarda la forma pactada para el papel y la anual para
 * la aritmética.
 */
export type InterestPeriod = 'MONTHLY' | 'ANNUAL';

/** Tasa legal supletoria: 6% anual (art. 362 Cód. Comercio, vía art. 174 LGTOC). */
export const LEGAL_ANNUAL_RATE_PCT = 6;

/**
 * Mensual a anual sin capitalizar: doce meses.
 *
 * No se usa `(1+i)^12` a propósito. El interés moratorio del art. 174 es simple
 * —no genera intereses sobre intereses—, así que componerlo aquí inflaría la
 * deuda respecto de lo que dice el documento.
 */
export function toAnnualRatePct(value: number, period: InterestPeriod): number {
  return period === 'MONTHLY' ? value * 12 : value;
}

export function fromAnnualRatePct(annualPct: number, period: InterestPeriod): number {
  return period === 'MONTHLY' ? annualPct / 12 : annualPct;
}

/** "3% mensual (36% anual)" — como se firmó y como se calcula. */
export function describeRate(annualPct: number | null, period: InterestPeriod): string {
  if (annualPct === null) return 'Sin intereses pactados';
  if (annualPct === 0) return 'Intereses pactados en cero';
  const pacted = fromAnnualRatePct(annualPct, period);
  const trim = (value: number): string => String(Number(value.toFixed(4)));
  return period === 'MONTHLY'
    ? `${trim(pacted)}% mensual (${trim(annualPct)}% anual)`
    : `${trim(annualPct)}% anual`;
}
