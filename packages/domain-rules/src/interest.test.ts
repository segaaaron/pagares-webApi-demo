import { describe, expect, it } from 'vitest';
import {
  accrueInterest,
  lateInterestBase,
  describeRate,
  describeRateWithAnnual,
  fromAnnualRatePct,
  toAnnualRatePct,
} from './interest.js';

const base = { balanceCents: 2_500_000n, basis: 360 as const };

describe('interés moratorio', () => {
  it('no devenga sin intereses pactados', () => {
    // null significa "no se pactaron"; 0 significa "se pactaron en cero".
    expect(accrueInterest({ ...base, annualRatePct: null, daysOverdue: 30 })).toBe(0n);
  });

  it('no devenga con tasa pactada en cero', () => {
    expect(accrueInterest({ ...base, annualRatePct: 0, daysOverdue: 30 })).toBe(0n);
  });

  it('no devenga el mismo día del vencimiento', () => {
    expect(accrueInterest({ ...base, annualRatePct: 24, daysOverdue: 0 })).toBe(0n);
  });

  it('devenga sobre el saldo y no sobre el importe original', () => {
    const full = accrueInterest({ ...base, annualRatePct: 24, daysOverdue: 30 });
    const half = accrueInterest({ ...base, balanceCents: 1_250_000n, annualRatePct: 24, daysOverdue: 30 });
    expect(half * 2n).toBe(full);
  });

  it('calcula el caso conocido: 24% anual, 30 días sobre $25,000 base 360', () => {
    // 25000 * 0.24 * 30/360 = 500.00
    expect(accrueInterest({ ...base, annualRatePct: 24, daysOverdue: 30 })).toBe(50_000n);
  });

  it('es simple, no capitalizable: el doble de días da el doble de interés', () => {
    const thirty = accrueInterest({ ...base, annualRatePct: 24, daysOverdue: 30 });
    const sixty = accrueInterest({ ...base, annualRatePct: 24, daysOverdue: 60 });
    expect(sixty).toBe(thirty * 2n);
  });

  it('distingue base 360 de base 365', () => {
    const b360 = accrueInterest({ ...base, annualRatePct: 24, daysOverdue: 30, basis: 360 });
    const b365 = accrueInterest({ ...base, annualRatePct: 24, daysOverdue: 30, basis: 365 });
    expect(b365).toBeLessThan(b360);
  });

  it('no devenga con saldo cero', () => {
    expect(accrueInterest({ ...base, balanceCents: 0n, annualRatePct: 24, daysOverdue: 90 })).toBe(0n);
  });
});

describe('periodicidad de la tasa', () => {
  it('convierte mensual a anual sin capitalizar', () => {
    // 3% mensual son 36% anual simples, no 42.58% compuestos.
    expect(toAnnualRatePct(3, 'MONTHLY')).toBe(36);
    expect(toAnnualRatePct(36, 'ANNUAL')).toBe(36);
  });

  it('vuelve a la forma pactada', () => {
    expect(fromAnnualRatePct(36, 'MONTHLY')).toBe(3);
    expect(fromAnnualRatePct(36, 'ANNUAL')).toBe(36);
  });

  it('el documento dice la tasa como se pactó, sin equivalencias', () => {
    /*
     * "3% mensual (36% anual)" metía en el título un número que nadie firmó, y
     * encima ambiguo: el 36 es el equivalente **simple** —el que usa la fórmula
     * de §12.3— pero se lee como efectivo, y capitalizando saldría 42.58 %.
     */
    expect(describeRate(36, 'MONTHLY')).toBe('3% mensual');
    expect(describeRate(36, 'ANNUAL')).toBe('36% anual');
    expect(describeRate(null, 'ANNUAL')).toBe('Sin intereses pactados');
    expect(describeRate(0, 'MONTHLY')).toBe('Intereses pactados en cero');
  });

  it('la equivalencia anual existe aparte, y dice que es simple', () => {
    // Para comparar cartera y explicar un cálculo, no para el documento.
    expect(describeRateWithAnnual(36, 'MONTHLY')).toBe('3% mensual · 36% anual simple');
    expect(describeRateWithAnnual(36, 'ANNUAL')).toBe('36% anual');
    expect(describeRateWithAnnual(null, 'MONTHLY')).toBe('Sin intereses pactados');
  });
});

/**
 * Sobre qué corre el moratorio (ADR 0020).
 *
 * La cuota de un plan lleva su interés ordinario dentro. Cobrar mora sobre el
 * saldo entero es cobrar interés sobre interés, que es lo que prohíbe el art.
 * 363 del Código de Comercio salvo pacto de capitalizarlos.
 */
describe('base del moratorio', () => {
  it('descuenta el interés ordinario que queda por cubrir', () => {
    // Cuota de 6,027.73 con 1,800 de precio del préstamo: la mora corre sobre
    // los 4,227.73 de capital.
    expect(
      lateInterestBase({
        balanceCents: 602_773n,
        ordinaryInterestPendingCents: 180_000n,
        overPrincipalOnly: true,
      }),
    ).toBe(422_773n);
  });

  it('sobre el saldo entero cuando así se pactó', () => {
    expect(
      lateInterestBase({
        balanceCents: 602_773n,
        ordinaryInterestPendingCents: 180_000n,
        overPrincipalOnly: false,
      }),
    ).toBe(602_773n);
  });

  it('un pagaré suelto no cambia: no lleva interés dentro', () => {
    // Es el caso de toda la cartera anterior a los planes.
    expect(
      lateInterestBase({
        balanceCents: 1_000_000n,
        ordinaryInterestPendingCents: 0n,
        overPrincipalOnly: true,
      }),
    ).toBe(1_000_000n);
  });

  it('nunca devuelve una base negativa', () => {
    // Cobrar moratorio al revés no significa nada.
    expect(
      lateInterestBase({
        balanceCents: 100_000n,
        ordinaryInterestPendingCents: 180_000n,
        overPrincipalOnly: true,
      }),
    ).toBe(0n);
  });
});

describe('la tasa con decimales', () => {
  it('3 es 3.0, y 12.5 es 12.5', () => {
    // No hay redondeo a entero en ningún punto: lo que se teclea es lo que se
    // pacta, y el documento lo imprime igual.
    expect(toAnnualRatePct(3, 'MONTHLY')).toBe(36);
    expect(toAnnualRatePct(12.5, 'MONTHLY')).toBe(150);
    expect(describeRate(150, 'MONTHLY')).toBe('12.5% mensual');
  });

  it('la quincenal vale el doble que la mensual del mismo número', () => {
    expect(toAnnualRatePct(1.5, 'BIWEEKLY')).toBe(36);
    expect(toAnnualRatePct(3, 'BIWEEKLY')).toBe(72);
    expect(describeRate(36, 'BIWEEKLY')).toBe('1.5% quincenal');
  });

  it('ida y vuelta: lo que se pactó es lo que se lee', () => {
    for (const period of ['MONTHLY', 'BIWEEKLY', 'ANNUAL'] as const) {
      for (const valor of [3, 3.5, 12.5, 0.75, 1.125]) {
        expect(fromAnnualRatePct(toAnnualRatePct(valor, period), period)).toBeCloseTo(valor, 10);
      }
    }
  });

  it('cuatro decimales de punto porcentual llegan al cálculo', () => {
    /*
     * `accrueInterest` escala la tasa por 10 000, así que 0.0001 puntos son
     * significativos. Es la precisión que la columna tiene que guardar: con dos
     * decimales, una tasa así volvía convertida en otra.
     */
    const conDecimales = accrueInterest({
      balanceCents: 100_000_000n,
      annualRatePct: 36.0001,
      daysOverdue: 360,
      basis: 360,
    });
    const redonda = accrueInterest({
      balanceCents: 100_000_000n,
      annualRatePct: 36,
      daysOverdue: 360,
      basis: 360,
    });
    expect(conDecimales).toBeGreaterThan(redonda);
  });

  it('una tasa quincenal alta cabe en la columna', () => {
    // 100 % quincenal son 2 400 % anuales. Es usura y un juez la reduce de
    // oficio, pero registrarla no puede reventar: Decimal(8,4) llega a 9 999.9999.
    expect(toAnnualRatePct(100, 'BIWEEKLY')).toBe(2400);
    expect(2400).toBeLessThan(9999.9999);
  });
});
