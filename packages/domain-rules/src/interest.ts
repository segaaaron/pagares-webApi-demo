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

/**
 * Sobre qué corre el moratorio (§12.3, ADR 0020).
 *
 * El saldo de una cuota lleva dentro su **interés ordinario**, que es el precio
 * del préstamo. Cobrar moratorio sobre ese saldo entero es cobrar interés sobre
 * interés, y el art. 363 del Código de Comercio dice que los intereses vencidos
 * y no pagados no devengan intereses salvo pacto de capitalizarlos.
 *
 * Por eso, por omisión, la sanción corre sólo sobre el **capital** que queda por
 * devolver. Quien tenga ese pacto puede apagarlo, y entonces es una decisión
 * escrita y no un descuido del cálculo.
 */
export function lateInterestBase(input: {
  balanceCents: bigint;
  /** Interés ordinario de la cuota que todavía no se ha cubierto. */
  ordinaryInterestPendingCents: bigint;
  overPrincipalOnly: boolean;
}): bigint {
  if (!input.overPrincipalOnly || input.ordinaryInterestPendingCents <= 0n) {
    return input.balanceCents > 0n ? input.balanceCents : 0n;
  }
  const base = input.balanceCents - input.ordinaryInterestPendingCents;
  return base > 0n ? base : 0n;
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

const trimRate = (value: number): string => String(Number(value.toFixed(4)));

/**
 * La tasa **como se pactó**, y nada más: "3% mensual".
 *
 * Es lo que va en el documento. Añadir ahí la equivalencia anual —"(36% anual)"—
 * mete en el título un número que nadie firmó, y encima uno que se lee mal: el
 * 36 % es el equivalente **simple**, que es como calcula este sistema (§12.3),
 * pero quien lo ve suele entenderlo como tasa efectiva, y capitalizando mes a
 * mes un 3 % mensual sale 42.58 % al año. Dos cifras distintas para lo mismo en
 * un papel que se lleva a un juzgado no ayudan a nadie.
 */
export function describeRate(annualPct: number | null, period: InterestPeriod): string {
  if (annualPct === null) return 'Sin intereses pactados';
  if (annualPct === 0) return 'Intereses pactados en cero';
  const pacted = fromAnnualRatePct(annualPct, period);
  return period === 'MONTHLY'
    ? `${trimRate(pacted)}% mensual`
    : `${trimRate(annualPct)}% anual`;
}

/**
 * La misma tasa, con su equivalencia anual y dicha con todas las letras.
 *
 * Sólo para las pantallas de operación —comparar cartera, explicar un cálculo—,
 * nunca para el documento. Se llama "anual simple" a propósito: es la que entra
 * en la fórmula de §12.3, sin capitalizar, y no es la tasa efectiva.
 */
export function describeRateWithAnnual(
  annualPct: number | null,
  period: InterestPeriod,
): string {
  if (annualPct === null || annualPct === 0) return describeRate(annualPct, period);
  if (period === 'ANNUAL') return `${trimRate(annualPct)}% anual`;
  return `${trimRate(fromAnnualRatePct(annualPct, period))}% mensual · ${trimRate(
    annualPct,
  )}% anual simple`;
}
