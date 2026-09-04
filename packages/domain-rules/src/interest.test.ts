import { describe, expect, it } from 'vitest';
import {
  accrueInterest,
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
