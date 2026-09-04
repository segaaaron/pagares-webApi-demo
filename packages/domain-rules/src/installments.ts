/**
 * Serie de pagarés, uno por mensualidad (§12).
 *
 * Un pagaré es un título de pago único: la ley no contempla un calendario
 * dentro. Documentar doce mensualidades es firmar doce pagarés numerados, cada
 * uno con su vencimiento, que es lo que se hace con el talonario de papel.
 *
 * La ventaja no es de forma: si el deudor falla la quinta cuota, se reclama
 * **esa**, que ya venció, sin esperar a que venza el resto.
 */

/** Doce meses es un año; veinticuatro, el plazo más largo que se ve en la calle. */
export const MAX_INSTALLMENTS = 24;

function assertRange(installments: number): void {
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    throw new RangeError('installments_out_of_range');
  }
}

/**
 * Reparte el importe entre las cuotas, sin perder ni un centavo.
 *
 * El sobrante de la división va en la **primera**: así el resto son cifras
 * redondas y lo desigual queda atrás cuanto antes, en vez de esperar al deudor
 * al final del plazo.
 */
export function splitAmount(totalCents: bigint, installments: number): bigint[] {
  assertRange(installments);

  const veces = BigInt(installments);
  const base = totalCents / veces;
  // Un pagaré por cero pesos no es un pagaré.
  if (base <= 0n) throw new RangeError('installments_amount_too_small');

  const sobrante = totalCents - base * veces;
  return Array.from({ length: installments }, (_, indice) =>
    indice === 0 ? base + sobrante : base,
  );
}

/**
 * Los vencimientos, mes a mes desde el primero.
 *
 * El día se conserva salvo que el mes no lo tenga: el 31 de enero vence el 28
 * de febrero, no el 3 de marzo. Sin esa corrección el pagaré vencería un mes
 * más tarde de lo pactado, que es un error caro y silencioso.
 */
export function installmentDates(firstDueDate: string, installments: number): string[] {
  assertRange(installments);

  const [año, mes, dia] = firstDueDate.split('-').map(Number) as [number, number, number];

  return Array.from({ length: installments }, (_, indice) => {
    const mesDestino = mes - 1 + indice;
    // Día 0 del mes siguiente es el último del mes destino.
    const ultimoDelMes = new Date(Date.UTC(año, mesDestino + 1, 0)).getUTCDate();
    const fecha = new Date(Date.UTC(año, mesDestino, Math.min(dia, ultimoDelMes)));
    return fecha.toISOString().slice(0, 10);
  });
}
