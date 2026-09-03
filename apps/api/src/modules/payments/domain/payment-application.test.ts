import { describe, expect, it } from 'vitest';
import { splitPayment } from './payment-application.js';

describe('aplicación del abono', () => {
  it('cubre primero el interés devengado', () => {
    const split = splitPayment(100_000n, 30_000n, true);
    expect(split.toInterestCents).toBe(30_000n);
    expect(split.toPrincipalCents).toBe(70_000n);
  });

  it('si el abono no alcanza, todo va al interés', () => {
    const split = splitPayment(20_000n, 30_000n, true);
    expect(split.toInterestCents).toBe(20_000n);
    expect(split.toPrincipalCents).toBe(0n);
  });

  it('sin interés devengado, todo va a capital', () => {
    const split = splitPayment(100_000n, 0n, true);
    expect(split.toPrincipalCents).toBe(100_000n);
  });

  it('respeta la configuración inversa', () => {
    const split = splitPayment(100_000n, 30_000n, false);
    expect(split.toInterestCents).toBe(0n);
    expect(split.toPrincipalCents).toBe(100_000n);
  });

  it('nunca reparte más de lo abonado', () => {
    const split = splitPayment(50_000n, 999_000n, true);
    expect(split.toInterestCents + split.toPrincipalCents).toBe(50_000n);
  });
});
