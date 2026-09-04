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

/**
 * Moneda única de la instalación (§25.15). El importe en letra está escrito para
 * pesos; añadir otra moneda exige su propia regla y hoy no aporta nada.
 */
export const CURRENCY = 'MXN' as const;

export interface Money {
  /** Centavos como cadena: un pagaré grande no cabe en el entero seguro (§12.1). */
  cents: string;
  currency: typeof CURRENCY;
  formatted: string;
}

/**
 * El dinero, tal como sale de la API.
 *
 * Las dos formas viajan juntas a propósito: el texto para leerlo y los centavos
 * para calcular con ellos. Mandar sólo el texto obliga a quien lo recibe a
 * deshacer el formato —y a equivocarse por un factor de cien el día que cambie
 * el separador—, y mandar sólo el número obliga a cada cliente a reinventar el
 * formato de pesos, que ya vive aquí.
 */
export function money(cents: bigint): Money {
  return { cents: cents.toString(), currency: CURRENCY, formatted: formatMxn(cents) };
}
