/**
 * Aplicación de un abono (§12.3, ADR 0020).
 *
 * El dinero que entrega el deudor se reparte en **tres** conceptos, no en dos, y
 * el orden importa porque decide qué le queda debiendo:
 *
 * 1. **Moratorio**: la sanción por los días de atraso ya corridos.
 * 2. **Interés ordinario**: el precio del préstamo, la parte de la cuota que es
 *    ganancia de quien presta (§12).
 * 3. **Capital**: lo que de verdad baja la deuda.
 *
 * Los dos intereses van antes que el capital porque así lo dice el art. 2094 del
 * Código Civil Federal, y porque lo contrario dejaría intereses vivos mientras
 * el capital baja. El moratorio va primero por ser la deuda más antigua y la que
 * sigue creciendo mientras no se cubra.
 *
 * Sin el segundo concepto, un abono a una cuota que aún no vencía se registraba
 * **entero a capital**: el recibo le decía al deudor que pagó capital cuando
 * pagó el precio del préstamo, y los reportes contaban la ganancia como
 * devolución.
 */
export interface PaymentSplit {
  /** Moratorio: la sanción por el atraso (§12.3). */
  readonly toInterestCents: bigint;
  /** Interés ordinario: el precio del préstamo (§12). */
  readonly toOrdinaryInterestCents: bigint;
  readonly toPrincipalCents: bigint;
}

export interface PaymentSplitInput {
  amountCents: bigint;
  /** Moratorio devengado a la fecha del abono. */
  lateInterestCents: bigint;
  /** Interés ordinario de la cuota que todavía no se ha cubierto. */
  ordinaryInterestPendingCents: bigint;
  /** Configuración de la organización: cubrir intereses antes que capital. */
  interestFirst: boolean;
}

export function splitPayment(input: PaymentSplitInput): PaymentSplit {
  const { amountCents } = input;

  if (!input.interestFirst) {
    // La organización eligió abonar a capital primero. Es su decisión y se
    // respeta, pero entonces no hay reparto que hacer.
    return { toInterestCents: 0n, toOrdinaryInterestCents: 0n, toPrincipalCents: amountCents };
  }

  const menor = (a: bigint, b: bigint): bigint => (a < b ? a : b);

  const toInterest = menor(amountCents, mayorQueCero(input.lateInterestCents));
  const resto = amountCents - toInterest;
  const toOrdinary = menor(resto, mayorQueCero(input.ordinaryInterestPendingCents));

  return {
    toInterestCents: toInterest,
    toOrdinaryInterestCents: toOrdinary,
    toPrincipalCents: resto - toOrdinary,
  };
}

/** Un concepto en negativo repartiría dinero al revés; se trata como cero. */
function mayorQueCero(valor: bigint): bigint {
  return valor > 0n ? valor : 0n;
}
