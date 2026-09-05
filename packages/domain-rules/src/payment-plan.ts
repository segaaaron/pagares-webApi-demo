/**
 * Plan de pagos pactado (§12).
 *
 * Un pagaré es de pago único, así que un préstamo a plazos se documenta con una
 * serie de pagarés (ADR 0015). Lo que decide **cuánto** dice cada uno es esto:
 * el reparto del préstamo y del interés ordinario a lo largo del plazo.
 *
 * Ojo con no confundir dos intereses distintos:
 *
 * · El **ordinario** es el precio del préstamo, lo que gana el prestamista por
 *   prestar desde que entrega el dinero hasta que se lo devuelven. Va dentro de
 *   las cuotas y se pacta aquí.
 * · El **moratorio** (§12.3, art. 174 LGTOC) es la sanción por pagar tarde.
 *   Corre sólo después del vencimiento y sobre lo que se deba entonces.
 *
 * Banxico distingue dos formas de calcular el ordinario, y la diferencia no es
 * de matiz: sobre **saldos insolutos** se calcula cada mes sobre lo que aún se
 * debe; sobre **saldo global**, siempre sobre el importe original aunque ya se
 * haya pagado la mitad. Con la misma tasa nominal, su ejemplo da 77.1 % de CAT
 * por saldos insolutos y 147 % global. Aquí están las dos porque las dos se
 * usan en la calle, nombradas por lo que son.
 */
import { MAX_INSTALLMENTS, splitAmount } from './installments.js';

export const PLAN_MODELS = ['NONE', 'INSOLUTOS', 'GLOBAL'] as const;
export type PlanModel = (typeof PLAN_MODELS)[number];

export interface PlanRow {
  /** 1..n */
  index: number;
  /** Lo que paga ese mes: interés más capital. */
  paymentCents: bigint;
  /** La parte que es precio del préstamo. */
  interestCents: bigint;
  /** La parte que baja la deuda. */
  principalCents: bigint;
  /** Lo que queda debiendo después de pagar esta cuota. */
  balanceCents: bigint;
}

export interface PaymentPlan {
  model: PlanModel;
  rows: PlanRow[];
  /** Lo prestado. */
  principalCents: bigint;
  /** El precio del préstamo: lo que gana quien presta. */
  totalInterestCents: bigint;
  /** Lo que el deudor acaba pagando. */
  totalCents: bigint;
}

export interface PaymentPlanInput {
  principalCents: bigint;
  /** Tasa **ordinaria** anual pactada. Cero o nula: sin precio por prestar. */
  annualRatePct: number | null;
  installments: number;
  model: PlanModel;
}

/** Redondeo a centavo entero con aritmética exacta: nada de coma flotante. */
function redondear(numerador: bigint, denominador: bigint): bigint {
  return (numerador + denominador / 2n) / denominador;
}

export function buildPaymentPlan(input: PaymentPlanInput): PaymentPlan {
  const { principalCents, installments, model } = input;

  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    throw new RangeError('installments_out_of_range');
  }
  if (principalCents <= 0n) throw new RangeError('principal_not_positive');

  const anual = input.annualRatePct ?? 0;
  // La tasa mensual en diezmilésimas de punto: 3 % → 300. Entero, para que el
  // interés de cada mes no dependa de cómo redondee la coma flotante.
  const mensualBps = BigInt(Math.round((anual / 12) * 10_000));
  const sinInteres = model === 'NONE' || mensualBps === 0n;

  const filas: PlanRow[] = [];
  const veces = BigInt(installments);

  if (sinInteres) {
    /*
     * Reparto del capital y nada más: el interés sólo corre si hay atraso.
     *
     * Lo hace `splitAmount` y no un bucle propio: repartir un importe entre
     * cuotas ya era una regla con su nombre y sus pruebas, y tenerla dos veces
     * garantizaba que un día dijeran cosas distintas —de hecho lo hicieron: una
     * dejaba el sobrante en la primera cuota y la otra en la última.
     */
    let saldo = principalCents;
    for (const [i, capital] of splitAmount(principalCents, installments).entries()) {
      saldo -= capital;
      filas.push({
        index: i + 1,
        paymentCents: capital,
        interestCents: 0n,
        principalCents: capital,
        balanceCents: saldo,
      });
    }
    return resumen(model, principalCents, filas);
  }

  if (model === 'GLOBAL') {
    /*
     * Interés sobre el importe original, todo el plazo. Abonar no lo baja, y
     * por eso sale más caro con la misma tasa: es el dato que la pantalla tiene
     * que enseñar, no esconder.
     */
    const interesTotal = redondear(principalCents * mensualBps * veces, 1_000_000n);
    const totalAPagar = principalCents + interesTotal;
    const cuota = totalAPagar / veces;

    let saldo = principalCents;
    let interesRepartido = 0n;
    const interesPorCuota = interesTotal / veces;

    for (let i = 0; i < installments; i += 1) {
      const ultima = i === installments - 1;
      const interes = ultima ? interesTotal - interesRepartido : interesPorCuota;
      interesRepartido += interes;

      // La última cuota carga con lo que la división haya dejado suelto, para
      // que el capital sume el préstamo exacto y el saldo acabe en cero.
      const capital = ultima ? saldo : cuota - interesPorCuota;
      saldo -= capital;

      filas.push({
        index: i + 1,
        paymentCents: interes + capital,
        interestCents: interes,
        principalCents: capital,
        balanceCents: saldo,
      });
    }
    return resumen(model, principalCents, filas);
  }

  /*
   * Saldos insolutos, cuota fija (sistema francés):
   *
   *   cuota = P · i / (1 − (1 + i)^−n)
   *
   * El factor se calcula en coma flotante —es una potencia— pero **sólo** para
   * fijar la cuota; el resto de la tabla se arma con enteros, así que ningún
   * centavo se pierde por el camino.
   */
  const i = Number(mensualBps) / 1_000_000;
  const factor = (i * (1 + i) ** installments) / ((1 + i) ** installments - 1);
  const cuota = BigInt(Math.round(Number(principalCents) * factor));

  let saldo = principalCents;
  for (let k = 0; k < installments; k += 1) {
    const ultima = k === installments - 1;
    const interes = redondear(saldo * mensualBps, 1_000_000n);
    // La última cancela lo que quede: así el saldo cierra en cero aunque la
    // cuota redondeada no encaje al centavo.
    const capital = ultima ? saldo : cuota - interes;
    saldo -= capital;

    filas.push({
      index: k + 1,
      paymentCents: interes + capital,
      interestCents: interes,
      principalCents: capital,
      balanceCents: saldo,
    });
  }

  return resumen(model, principalCents, filas);
}

function resumen(model: PlanModel, principalCents: bigint, rows: PlanRow[]): PaymentPlan {
  const totalInterestCents = rows.reduce((suma, fila) => suma + fila.interestCents, 0n);
  return {
    model,
    rows,
    principalCents,
    totalInterestCents,
    totalCents: rows.reduce((suma, fila) => suma + fila.paymentCents, 0n),
  };
}

/** Una cuota que todavía no está saldada, tal como la guarda su pagaré. */
export interface PendingInstallment {
  /** Posición dentro de la serie: 1..n. */
  index: number;
  /** Vencimiento civil, `YYYY-MM-DD`. */
  dueDate: string;
  /** Lo que dice el título. */
  amountCents: bigint;
  /** Lo abonado hasta ahora. */
  paidCents: bigint;
  /** El interés ordinario que lleva dentro esa cuota, según el plan pactado. */
  interestCents: bigint;
  /**
   * Cuánto de ese interés ya se cubrió, según el libro de abonos.
   *
   * Cuando se conoce, manda sobre cualquier deducción: el reparto de cada abono
   * queda escrito al registrarlo (ADR 0020), y suponerlo desde el importe
   * pagado sería contar dos veces lo que ya está contado.
   */
  interestPaidCents?: bigint;
}

export interface EarlyPayoff {
  model: PlanModel;
  onDate: string;
  /** El capital que queda por devolver. */
  principalCents: bigint;
  /** El interés ordinario que sí se debe pese a pagar antes. */
  interestDueCents: bigint;
  /** El interés que el deudor se ahorra por adelantar el pago. */
  savedCents: bigint;
  /** Lo que hay que entregar hoy: capital más el interés que se debe. */
  payoffCents: bigint;
  /** De las cuotas pendientes, cuántas ya vencieron a esa fecha. */
  dueCount: number;
  pendingCount: number;
}

/**
 * Liquidación anticipada: qué pasa si el deudor paga hoy lo que le queda (§12).
 *
 * Que se ahorre algo o no **depende de cómo se pactó el interés**, y por eso no
 * hay una sola respuesta honesta:
 *
 * · Sobre **saldos insolutos**, el interés es el precio del tiempo: si el
 *   dinero se devuelve antes, el tiempo no transcurre y ese interés futuro no
 *   se causa. Se ahorra.
 * · Sobre **saldo global**, el interés se pactó de una vez sobre el importe
 *   original, así que adelantar no lo baja. No es un descuido nuestro: es lo
 *   que se firmó, y la pantalla lo dice con todas sus letras.
 *
 * Dentro de una cuota parcialmente abonada, lo pagado se imputa primero a
 * intereses y después a capital (art. 2094 CCF), que es como se hace y como lo
 * esperaría un juez si alguien revisa la cuenta.
 *
 * El **moratorio** no entra aquí: es sanción por atraso, no precio del
 * préstamo, y se calcula sobre los días que corrieron (§12.3).
 */
export function settleEarly(input: {
  model: PlanModel;
  onDate: string;
  pending: PendingInstallment[];
}): EarlyPayoff {
  const { model, onDate } = input;

  let principalCents = 0n;
  let interestDueCents = 0n;
  let savedCents = 0n;
  let dueCount = 0;

  for (const cuota of input.pending) {
    const resta = cuota.amountCents - cuota.paidCents;
    if (resta <= 0n) continue;

    /*
     * Lo abonado cubrió primero el interés; lo que sobre de él sigue debiéndose.
     * Si el libro dice cuánto se aplicó al interés, se usa ese dato; si no —una
     * cuota anterior al ADR 0020—, se deduce con la imputación del art. 2094.
     */
    const interesPagado =
      cuota.interestPaidCents ??
      (cuota.paidCents < cuota.interestCents ? cuota.paidCents : cuota.interestCents);
    const porCubrir = cuota.interestCents - interesPagado;
    // Ni negativo —una reversa puede dejarlo por debajo de cero— ni más que lo
    // que resta de la cuota: lo demás es capital.
    const interesRestante = porCubrir > 0n ? porCubrir : 0n;
    const interes = interesRestante > resta ? resta : interesRestante;
    principalCents += resta - interes;

    const vencida = cuota.dueDate <= onDate;
    if (vencida) dueCount += 1;

    // La cuota ya vencida se debe entera: su interés ya se causó. La futura
    // sólo perdona el interés si se pactó sobre saldos insolutos.
    if (vencida || model !== 'INSOLUTOS') interestDueCents += interes;
    else savedCents += interes;
  }

  return {
    model,
    onDate,
    principalCents,
    interestDueCents,
    savedCents,
    payoffCents: principalCents + interestDueCents,
    dueCount,
    pendingCount: input.pending.filter((c) => c.amountCents > c.paidCents).length,
  };
}
