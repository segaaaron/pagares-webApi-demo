import { describe, expect, it } from 'vitest';
import { planOf, type PlanMember } from './plan-view.js';

/**
 * El plan de pagos que ve el deudor (§12).
 *
 * La regla es que el plan va por folio y **sólo con el folio firmado**: lo que
 * no ha firmado no es deuda suya todavía. Estas pruebas protegen justo eso, que
 * es lo que se rompe callado y le enseña al deudor un saldo que no debe.
 */
const cuota = (extra: Partial<PlanMember> = {}): PlanMember => ({
  status: 'ISSUED',
  amountCents: 602_773n,
  paidCents: 0n,
  seriesId: 'serie-1',
  seriesSize: 12,
  planModel: 'INSOLUTOS',
  ...extra,
});

describe('plan del deudor', () => {
  it('suma sólo las cuotas firmadas', () => {
    const plan = planOf([
      cuota({ status: 'PAID', paidCents: 602_773n }),
      cuota({ status: 'ISSUED' }),
      cuota({ status: 'PENDING_SIGNATURE' }),
      cuota({ status: 'PROCESSING_SIGNATURE' }),
    ]);

    expect(plan?.signedCount).toBe(2);
    expect(plan?.totalCents).toBe(1_205_546n);
    expect(plan?.paidCents).toBe(602_773n);
    expect(plan?.pendingCents).toBe(602_773n);
    expect(plan?.paidCount).toBe(1);
  });

  it('manda el tamaño pactado aunque falten firmas', () => {
    // Para poder decir «2 de 12 firmados» en vez de fingir un plan de dos.
    const plan = planOf([cuota(), cuota(), cuota({ status: 'PENDING_SIGNATURE' })]);
    expect(plan?.size).toBe(12);
    expect(plan?.signedCount).toBe(2);
  });

  it('sin ninguna firma no hay plan', () => {
    // Son folios sueltos pendientes de firma, y así hay que enseñarlos.
    expect(planOf([cuota({ status: 'PENDING_SIGNATURE' }), cuota({ status: 'PENDING_SIGNATURE' })])).toBeNull();
  });

  it('un pagaré suelto no es un plan', () => {
    expect(planOf([cuota({ seriesId: null, seriesSize: null })])).toBeNull();
  });

  it('lo anulado y lo renovado no cuentan', () => {
    // Uno no se debe y el otro se debe en el documento nuevo (§13.7).
    const plan = planOf([
      cuota(),
      cuota({ status: 'VOID' }),
      cuota({ status: 'RENEWED' }),
    ]);

    expect(plan?.signedCount).toBe(1);
    expect(plan?.totalCents).toBe(602_773n);
  });
});
