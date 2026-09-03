/**
 * Dinero en centavos enteros (§12.1). Nunca coma flotante:
 * un pagaré de $25,000.00 no puede persistirse como 24,999.999999.
 */
export const MAX_AMOUNT_CENTS = 99_999_999_999n;

export function assertValidAmount(cents: bigint): void {
  if (cents <= 0n) throw new RangeError('amount_not_positive');
  if (cents > MAX_AMOUNT_CENTS) throw new RangeError('amount_too_large');
}

export function formatMxn(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const pesos = abs / 100n;
  const centavos = abs % 100n;
  const grouped = pesos.toLocaleString('es-MX');
  return `${negative ? '-' : ''}$${grouped}.${centavos.toString().padStart(2, '0')} MXN`;
}
