/**
 * El calendario de pagos de un pagaré (ADR 0022).
 *
 * Un préstamo que se devuelve en cuotas se documenta con **un** pagaré por el
 * total y su tabla de amortización. Los arts. 17 y 130 LGTOC lo contemplan de
 * frente: el acreedor no puede rechazar un pago parcial, conserva el título
 * mientras no se le cubra íntegramente y anota en él lo cobrado.
 *
 * Las fechas de aquí no son vencimientos del título —el pagaré vence una sola
 * vez, el día de la última cuota— sino el calendario contra el que se mide el
 * cumplimiento.
 */

/** Doce meses es un año; veinticuatro, el plazo más largo que se ve en la calle. */
export const MAX_INSTALLMENTS = 24;

/**
 * Cada cuánto se paga (§12).
 *
 * Las dos que se usan aquí. Quincenal no es «dos veces al mes en fechas fijas»
 * sino **cada quince días**, que es como se pacta de viva voz y lo que permite
 * decir la fecha exacta de cada cuota sin depender de cuántos días tenga el mes.
 * A cambio, veinticuatro quincenas son 360 días y no un año entero; el interés
 * se calcula sobre veinticuatro periodos, que es la cuenta que hace quien presta.
 */
export const PAYMENT_FREQUENCIES = ['MONTHLY', 'BIWEEKLY'] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

/** Cuántas cuotas caben en un año. Es el divisor de la tasa anual (§12). */
export function periodsPerYear(frequency: PaymentFrequency): 12 | 24 {
  return frequency === 'BIWEEKLY' ? 24 : 12;
}

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
 * Las fechas de las cuotas, desde la primera.
 *
 * **Mensual**: el día se conserva salvo que el mes no lo tenga —el 31 de enero
 * vence el 28 de febrero, no el 3 de marzo—. Sin esa corrección la cuota caería
 * un mes más tarde de lo pactado, que es un error caro y silencioso.
 *
 * **Quincenal**: cada quince días exactos. Aquí no hay nada que corregir, y el
 * deudor puede contar los días él mismo, que es la mitad de por qué se pacta así.
 */
export function installmentDates(
  firstDueDate: string,
  installments: number,
  frequency: PaymentFrequency = 'MONTHLY',
): string[] {
  assertRange(installments);

  const [año, mes, dia] = firstDueDate.split('-').map(Number) as [number, number, number];

  if (frequency === 'BIWEEKLY') {
    return Array.from({ length: installments }, (_, indice) => {
      const fecha = new Date(Date.UTC(año, mes - 1, dia + indice * 15));
      return fecha.toISOString().slice(0, 10);
    });
  }

  return Array.from({ length: installments }, (_, indice) => {
    const mesDestino = mes - 1 + indice;
    // Día 0 del mes siguiente es el último del mes destino.
    const ultimoDelMes = new Date(Date.UTC(año, mesDestino + 1, 0)).getUTCDate();
    const fecha = new Date(Date.UTC(año, mesDestino, Math.min(dia, ultimoDelMes)));
    return fecha.toISOString().slice(0, 10);
  });
}

/** Una cuota tal como se pactó: no cambia después de emitir. */
export interface ScheduleRow {
  /** 1..n, en orden de vencimiento. */
  index: number;
  /** Fecha civil `YYYY-MM-DD`. */
  dueOn: string;
  amountCents: bigint;
  interestCents: bigint;
  principalCents: bigint;
}

/** Cómo va una cuota hoy. Se calcula, no se guarda. */
export interface SettledRow extends ScheduleRow {
  paidCents: bigint;
  balanceCents: bigint;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
}

/**
 * Reparte lo abonado entre las cuotas, de la más vieja a la más nueva.
 *
 * Es una vista derivada a propósito: lo pagado vive en el libro de abonos y en
 * `paidCents` del pagaré, y guardarlo también en cada cuota daría dos cifras
 * que un día dirían cosas distintas. Aquí se calcula al leer, con la cascada
 * que cualquiera espera —primero se salda lo que venció antes— y que es el
 * orden con el que el deudor entiende su propia deuda.
 *
 * Lo abonado de más no se inventa una cuota trece: se ignora. Un saldo a favor
 * es un problema de devolución, no de calendario.
 */
export function applyToSchedule(rows: readonly ScheduleRow[], paidCents: bigint): SettledRow[] {
  let restante = paidCents > 0n ? paidCents : 0n;

  return rows.map((fila) => {
    const cubierto = restante >= fila.amountCents ? fila.amountCents : restante;
    restante -= cubierto;
    const saldo = fila.amountCents - cubierto;

    return {
      ...fila,
      paidCents: cubierto,
      balanceCents: saldo,
      status: saldo === 0n ? 'PAID' : cubierto > 0n ? 'PARTIAL' : 'PENDING',
    };
  });
}

/**
 * Cuánto de un abono es el precio del préstamo, según el calendario (ADR 0022).
 *
 * El abono cae sobre las cuotas en cascada, y **dentro de cada una el interés va
 * antes que el capital** (art. 2094 CCF). Esto contesta lo único que el recibo
 * necesita saber: de lo que entrega hoy el deudor, cuánto es ganancia de quien
 * presta y cuánto baja de verdad la deuda.
 *
 * Se calcula sobre el calendario y no sobre el interés total del plan: cobrar de
 * un primer abono el interés de las doce cuotas sería cobrar por adelantado un
 * tiempo que todavía no ha transcurrido.
 *
 * `paidBeforeCents` es lo que ya llevaba abonado el pagaré. El moratorio no
 * entra aquí: es una sanción, se cubre antes y se cuenta aparte.
 */
export function ordinaryInterestIn(
  rows: readonly ScheduleRow[],
  paidBeforeCents: bigint,
  paymentCents: bigint,
): bigint {
  const antes = applyToSchedule(rows, paidBeforeCents);
  const despues = applyToSchedule(rows, paidBeforeCents + paymentCents);

  return rows.reduce((suma, fila, posicion) => {
    const cubiertoAntes = antes[posicion]?.paidCents ?? 0n;
    const cubiertoDespues = despues[posicion]?.paidCents ?? 0n;
    return suma + (menor(cubiertoDespues, fila.interestCents) - menor(cubiertoAntes, fila.interestCents));
  }, 0n);
}

function menor(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * El interés ordinario que el calendario todavía no ha cobrado (ADR 0020, 0022).
 *
 * Es sobre lo que **no** corre el moratorio: el saldo de un pagaré a plazos
 * lleva dentro el precio del préstamo, y sancionarlo sería interés sobre
 * interés, que el art. 363 del Código de Comercio prohíbe salvo pacto.
 */
export function outstandingOrdinaryInterest(
  rows: readonly ScheduleRow[],
  paidCents: bigint,
): bigint {
  return applyToSchedule(rows, paidCents).reduce((suma, cuota) => {
    const cubierto = menor(cuota.paidCents, cuota.interestCents);
    return suma + (cuota.interestCents - cubierto);
  }, 0n);
}

/**
 * Cuándo cae la primera cuota de un pagaré expedido hoy.
 *
 * Un periodo después de expedirlo: se presta el día 5 y se cobra el 20 si es
 * quincenal, o el 5 del mes siguiente si es mensual. Nadie cobra la primera
 * cuota el mismo día que entrega el dinero.
 */
export function firstDueDate(issueDate: string, frequency: PaymentFrequency = 'MONTHLY'): string {
  // Dos fechas desde la expedición: la suya y la siguiente. La siguiente es
  // ésta, y así el salto de periodo se escribe una sola vez, en `installmentDates`.
  return installmentDates(issueDate, 2, frequency)[1] as string;
}
