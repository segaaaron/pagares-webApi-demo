/**
 * Importe en letra (§25.6). Lo calcula el servidor y sólo el servidor: si el
 * número y la letra discrepan, el documento es impugnable.
 * Español de México, mayúsculas, centavos como NN/100 y sufijo M.N.
 */
const UNITS = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
  'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS',
  'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
] as const;

const TENS = [
  '', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
] as const;

const HUNDREDS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
] as const;

function underThousand(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  const head = HUNDREDS[hundreds] ?? '';
  if (rest === 0) return head;

  let tail: string;
  if (rest < 30) {
    tail = UNITS[rest] ?? '';
  } else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    tail = units === 0 ? (TENS[tens] ?? '') : `${TENS[tens] ?? ''} Y ${UNITS[units] ?? ''}`;
  }
  return head ? `${head} ${tail}` : tail;
}

/** Convierte la parte entera. Maneja el apócope de "UN" antes de MIL y MILLÓN. */
function integerToWords(n: number): string {
  if (n === 0) return 'CERO';

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];

  if (millions > 0) {
    parts.push(
      millions === 1 ? 'UN MILLÓN' : `${apocope(underThousand(millions))} MILLONES`,
    );
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'MIL' : `${apocope(underThousand(thousands))} MIL`);
  }
  if (rest > 0) parts.push(apocope(underThousand(rest)));

  return parts.join(' ');
}

/** "VEINTIUNO MIL" no existe: antes de un sustantivo se apocopa a "VEINTIÚN". */
function apocope(text: string): string {
  return text
    .replace(/VEINTIUNO$/, 'VEINTIÚN')
    .replace(/\bUNO$/, 'UN');
}

export interface AmountToWordsOptions {
  /** Sólo MXN por ahora: otra moneda exige su propia regla de letra (§25.15). */
  currency?: 'MXN';
}

export function amountToWords(cents: bigint, options: AmountToWordsOptions = {}): string {
  if (cents < 0n) throw new RangeError('amount_not_positive');
  const { currency = 'MXN' } = options;
  if (currency !== 'MXN') throw new RangeError('unsupported_currency');

  const pesos = Number(cents / 100n);
  const centavos = Number(cents % 100n);
  const noun = pesos === 1 ? 'PESO' : 'PESOS';

  return `${integerToWords(pesos)} ${noun} ${String(centavos).padStart(2, '0')}/100 M.N.`;
}
