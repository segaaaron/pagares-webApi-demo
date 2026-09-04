import { describe, expect, it } from 'vitest';
import { buildPaymentPlan, PLAN_MODELS, settleEarly } from './payment-plan.js';

/**
 * Plan de pagos pactado (§12).
 *
 * Banxico distingue dos formas de cobrar interés en un préstamo a plazos, y la
 * diferencia no es de matiz: sobre **saldos insolutos** el interés se calcula
 * cada mes sobre lo que aún se debe; sobre **saldo global**, siempre sobre el
 * importe original, aunque ya hayas pagado la mitad. En su propio ejemplo, la
 * misma tasa nominal da 77.1 % de CAT por saldos insolutos y 147 % global.
 *
 * El sistema hace las dos porque las dos se usan, pero las nombra por lo que
 * son y enseña el sobrecosto de la segunda.
 */
const base = {
  principalCents: 6_000_000n, // $60,000
  annualRatePct: 36, // 3% mensual
  installments: 12,
};

describe('sin interés ordinario', () => {
  it('reparte sólo el capital, como el pagaré suelto', () => {
    // Es lo que ya hacía el sistema: el interés sólo corre si hay atraso
    // (§12.3), y el plan es un calendario de capital.
    const plan = buildPaymentPlan({ ...base, model: 'NONE' });

    expect(plan.rows).toHaveLength(12);
    expect(plan.totalInterestCents).toBe(0n);
    expect(plan.totalCents).toBe(6_000_000n);
    for (const fila of plan.rows) expect(fila.interestCents).toBe(0n);
  });
});

describe('saldos insolutos', () => {
  const plan = buildPaymentPlan({ ...base, model: 'INSOLUTOS' });

  it('la cuota es fija salvo el último ajuste', () => {
    const cuotas = plan.rows.slice(0, -1).map((fila) => fila.paymentCents);
    expect(new Set(cuotas.map(String)).size).toBe(1);
  });

  it('el interés baja y el capital sube conforme se paga', () => {
    // Es lo que define este sistema: el interés se calcula sobre lo que queda.
    const primera = plan.rows[0]!;
    const ultima = plan.rows.at(-1)!;
    expect(primera.interestCents).toBeGreaterThan(ultima.interestCents);
    expect(primera.principalCents).toBeLessThan(ultima.principalCents);
  });

  it('el saldo llega exactamente a cero', () => {
    expect(plan.rows.at(-1)!.balanceCents).toBe(0n);
  });

  it('el capital de las cuotas suma el préstamo, sin sobras', () => {
    const capital = plan.rows.reduce((suma, fila) => suma + fila.principalCents, 0n);
    expect(capital).toBe(base.principalCents);
  });

  it('cada cuota es interés más capital', () => {
    for (const fila of plan.rows) {
      expect(fila.interestCents + fila.principalCents).toBe(fila.paymentCents);
    }
  });

  it('el total pagado es el préstamo más el interés', () => {
    expect(plan.totalCents).toBe(base.principalCents + plan.totalInterestCents);
  });
});

describe('saldo global', () => {
  const plan = buildPaymentPlan({ ...base, model: 'GLOBAL' });

  it('el interés se calcula sobre el importe original todo el plazo', () => {
    // 60,000 × 3% × 12 = 21,600. Abonar no lo baja: ésa es la diferencia.
    expect(plan.totalInterestCents).toBe(2_160_000n);
  });

  it('todas las cuotas son iguales salvo el ajuste final', () => {
    const cuotas = plan.rows.slice(0, -1).map((fila) => fila.paymentCents);
    expect(new Set(cuotas.map(String)).size).toBe(1);
  });

  it('sale más caro que saldos insolutos con la misma tasa', () => {
    /*
     * El hecho que hay que enseñar en pantalla. Con la misma tasa nominal, el
     * deudor paga bastante más; en el ejemplo de Banxico el CAT casi se duplica.
     */
    const insolutos = buildPaymentPlan({ ...base, model: 'INSOLUTOS' });
    expect(plan.totalInterestCents).toBeGreaterThan(insolutos.totalInterestCents);
  });

  it('el saldo también llega a cero y el capital cuadra', () => {
    expect(plan.rows.at(-1)!.balanceCents).toBe(0n);
    const capital = plan.rows.reduce((suma, fila) => suma + fila.principalCents, 0n);
    expect(capital).toBe(base.principalCents);
  });
});

describe('casos que rompen la aritmética', () => {
  it('sin tasa, los dos sistemas son el mismo reparto', () => {
    const insolutos = buildPaymentPlan({ ...base, annualRatePct: 0, model: 'INSOLUTOS' });
    const global = buildPaymentPlan({ ...base, annualRatePct: 0, model: 'GLOBAL' });

    expect(insolutos.totalInterestCents).toBe(0n);
    expect(global.totalInterestCents).toBe(0n);
    expect(insolutos.rows.map((f) => f.paymentCents)).toEqual(
      global.rows.map((f) => f.paymentCents),
    );
  });

  it('un solo pago es el préstamo más su interés de un mes', () => {
    const plan = buildPaymentPlan({ ...base, installments: 1, model: 'INSOLUTOS' });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]!.balanceCents).toBe(0n);
    expect(plan.rows[0]!.principalCents).toBe(base.principalCents);
  });

  it('los importes que no dividen exacto cuadran igual', () => {
    // 10,000 entre 7 con interés no da cifras redondas por ningún lado.
    for (const model of PLAN_MODELS) {
      const plan = buildPaymentPlan({
        principalCents: 1_000_000n,
        annualRatePct: 36,
        installments: 7,
        model,
      });
      const capital = plan.rows.reduce((suma, fila) => suma + fila.principalCents, 0n);
      const pagado = plan.rows.reduce((suma, fila) => suma + fila.paymentCents, 0n);

      expect(capital, `capital con ${model}`).toBe(1_000_000n);
      expect(pagado, `total con ${model}`).toBe(plan.totalCents);
      expect(plan.rows.at(-1)!.balanceCents, `saldo final con ${model}`).toBe(0n);
    }
  });

  it('ninguna cuota sale negativa ni en cero', () => {
    for (const model of PLAN_MODELS) {
      const plan = buildPaymentPlan({
        principalCents: 500_000n,
        annualRatePct: 60,
        installments: 24,
        model,
      });
      for (const fila of plan.rows) expect(fila.paymentCents).toBeGreaterThan(0n);
    }
  });

  it('rechaza un plazo fuera de rango', () => {
    expect(() => buildPaymentPlan({ ...base, installments: 0, model: 'NONE' })).toThrow(
      'installments_out_of_range',
    );
  });
});

describe('liquidación anticipada', () => {
  /** Convierte un plan en cuotas pendientes, como si nadie hubiera abonado. */
  const pendientes = (model: 'INSOLUTOS' | 'GLOBAL' | 'NONE', desde: number) =>
    buildPaymentPlan({ ...base, model })
      .rows.slice(desde)
      .map((fila, i) => ({
        index: desde + i + 1,
        // Vencen mes a mes desde marzo; la simulación se hace en febrero.
        dueDate: `2026-${String(3 + desde + i).padStart(2, '0')}-15`,
        amountCents: fila.paymentCents,
        paidCents: 0n,
        interestCents: fila.interestCents,
      }));

  it('sobre saldos insolutos, el interés futuro no se cobra', () => {
    // El interés es el precio del tiempo: si el dinero vuelve antes, ese tiempo
    // no transcurre y el interés no se causa.
    const liquidacion = settleEarly({
      model: 'INSOLUTOS',
      onDate: '2026-02-01',
      pending: pendientes('INSOLUTOS', 0),
    });

    expect(liquidacion.interestDueCents).toBe(0n);
    expect(liquidacion.savedCents).toBeGreaterThan(0n);
    expect(liquidacion.payoffCents).toBe(base.principalCents);
  });

  it('sobre saldo global, adelantar no ahorra nada', () => {
    /*
     * No es un descuido: el interés se pactó de una vez sobre el importe
     * original. La pantalla lo dice con todas sus letras, que es justo la
     * diferencia que hay que enseñar antes de firmar.
     */
    const liquidacion = settleEarly({
      model: 'GLOBAL',
      onDate: '2026-02-01',
      pending: pendientes('GLOBAL', 0),
    });

    expect(liquidacion.savedCents).toBe(0n);
    expect(liquidacion.interestDueCents).toBe(2_160_000n);
    expect(liquidacion.payoffCents).toBe(base.principalCents + 2_160_000n);
  });

  it('la cuota que ya venció se debe entera, interés incluido', () => {
    // Su interés ya se causó: perdonarlo sería regalar tiempo transcurrido.
    const cuotas = pendientes('INSOLUTOS', 0);
    const liquidacion = settleEarly({ model: 'INSOLUTOS', onDate: '2026-04-20', pending: cuotas });

    // Vencieron la de marzo y la de abril; las diez restantes, no.
    expect(liquidacion.dueCount).toBe(2);
    expect(liquidacion.interestDueCents).toBe(
      (cuotas[0]?.interestCents ?? 0n) + (cuotas[1]?.interestCents ?? 0n),
    );
    expect(liquidacion.payoffCents).toBe(base.principalCents + liquidacion.interestDueCents);
  });

  it('lo abonado se imputa primero al interés y luego al capital', () => {
    // Art. 2094 CCF. Con otra imputación, el capital bajaría más rápido de lo
    // que corresponde y la cuenta no cuadraría con la de un juez.
    const liquidacion = settleEarly({
      model: 'INSOLUTOS',
      onDate: '2026-02-01',
      pending: [
        {
          index: 1,
          dueDate: '2026-01-15',
          amountCents: 10_000n,
          paidCents: 1_000n,
          interestCents: 3_000n,
        },
      ],
    });

    expect(liquidacion.interestDueCents).toBe(2_000n); // 3,000 menos los 1,000 abonados
    expect(liquidacion.principalCents).toBe(7_000n);
    expect(liquidacion.payoffCents).toBe(9_000n);
  });

  it('las cuotas ya saldadas no suman nada', () => {
    const liquidacion = settleEarly({
      model: 'INSOLUTOS',
      onDate: '2026-02-01',
      pending: [
        { index: 1, dueDate: '2026-01-15', amountCents: 10_000n, paidCents: 10_000n, interestCents: 3_000n },
      ],
    });

    expect(liquidacion.pendingCount).toBe(0);
    expect(liquidacion.payoffCents).toBe(0n);
  });

  it('sin interés pactado, liquidar es entregar el capital que queda', () => {
    const liquidacion = settleEarly({
      model: 'NONE',
      onDate: '2026-02-01',
      pending: pendientes('NONE', 6),
    });

    expect(liquidacion.interestDueCents).toBe(0n);
    expect(liquidacion.savedCents).toBe(0n);
    expect(liquidacion.principalCents).toBe(liquidacion.payoffCents);
  });
});
