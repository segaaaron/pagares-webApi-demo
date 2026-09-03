/**
 * Aplicación de un abono (§12.3). Primero interés devengado, luego capital,
 * salvo que la organización configure lo contrario. El recibo desglosa ambas
 * partes: sin ese desglose, el deudor no puede verificar lo que pagó.
 */
export interface PaymentSplit {
  readonly toInterestCents: bigint;
  readonly toPrincipalCents: bigint;
}

export function splitPayment(
  amountCents: bigint,
  accruedInterestCents: bigint,
  interestFirst: boolean,
): PaymentSplit {
  if (!interestFirst) {
    return { toInterestCents: 0n, toPrincipalCents: amountCents };
  }
  const toInterest = amountCents < accruedInterestCents ? amountCents : accruedInterestCents;
  return { toInterestCents: toInterest, toPrincipalCents: amountCents - toInterest };
}
