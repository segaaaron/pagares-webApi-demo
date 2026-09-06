import { describe, expect, it } from 'vitest';
import { planOf, type PlanMember } from './plan-view.js';

/**
 * El plan de pagos que ve el deudor (§12, ADR 0022).
 *
 * Es **un** pagaré con su tabla de amortización, y el plan sólo existe si el
 * título está firmado: lo que no ha firmado no es deuda suya todavía. Estas
 * pruebas protegen eso, que es lo que se rompe callado y le enseña al deudor un
 * saldo que no debe.
 */
const CUOTAS = [
  { index: 1, dueOn: new Date('2026-10-05'), amountCents: 1_345_135n, interestCents: 150_000n, principalCents: 1_195_135n },
  { index: 2, dueOn: new Date('2026-11-05'), amountCents: 1_345_135n, interestCents: 114_146n, principalCents: 1_230_989n },
  { index: 3, dueOn: new Date('2026-12-05'), amountCents: 1_345_135n, interestCents: 77_216n, principalCents: 1_267_919n },
  { index: 4, dueOn: new Date('2027-01-05'), amountCents: 1_345_136n, interestCents: 39_179n, principalCents: 1_305_957n },
];

const pagare = (extra: Partial<PlanMember> = {}): PlanMember => ({
  status: 'ISSUED',
  amountCents: 5_380_541n,
  paidCents: 0n,
  planModel: 'INSOLUTOS',
  planPrincipalCents: 5_000_000n,
  planInterestCents: 380_541n,
  installments: CUOTAS,
  ...extra,
});

describe('plan del deudor', () => {
  it('enseña el plazo pactado y desglosa capital e interés', () => {
    const plan = planOf(pagare());

    expect(plan?.size).toBe(4);
    expect(plan?.totalCents).toBe(5_380_541n);
    expect(plan?.principalCents).toBe(5_000_000n);
    expect(plan?.interestCents).toBe(380_541n);
    expect(plan?.pendingCents).toBe(5_380_541n);
    expect(plan?.paidCount).toBe(0);
  });

  it('lo abonado salda las cuotas de la más vieja a la más nueva', () => {
    const plan = planOf(pagare({ paidCents: 2_000_000n }));

    expect(plan?.paidCount).toBe(1);
    expect(plan?.paidCents).toBe(2_000_000n);
    expect(plan?.pendingCents).toBe(3_380_541n);
    // La segunda cuota va a medias: lo que falta de ella, no su importe entero.
    expect(plan?.nextDueOn).toBe('2026-11-05');
    expect(plan?.nextAmountCents).toBe(690_270n);
  });

  it('cubierto todo, ya no toca nada', () => {
    const plan = planOf(pagare({ status: 'PAID', paidCents: 5_380_541n }));

    expect(plan?.paidCount).toBe(4);
    expect(plan?.nextDueOn).toBeNull();
    expect(plan?.nextAmountCents).toBeNull();
  });

  it('sin firmar no hay plan', () => {
    // Es una petición pendiente de firma, y así hay que enseñarla (ADR 0018).
    expect(planOf(pagare({ status: 'PENDING_SIGNATURE' }))).toBeNull();
    expect(planOf(pagare({ status: 'PROCESSING_SIGNATURE' }))).toBeNull();
  });

  it('un pagaré de pago único no es un plan', () => {
    expect(planOf(pagare({ installments: [] }))).toBeNull();
  });

  it('lo anulado y lo renovado no tienen plan', () => {
    // Uno no se debe y el otro se debe en el documento nuevo (§13.7).
    expect(planOf(pagare({ status: 'VOID' }))).toBeNull();
    expect(planOf(pagare({ status: 'RENEWED' }))).toBeNull();
  });
});
