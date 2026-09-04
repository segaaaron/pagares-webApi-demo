import { describe, expect, it } from 'vitest';
import { checkSettlementTolerance } from './settlement-tolerance.js';

describe('tolerancia de liquidación', () => {
  it('deja cerrar un remanente que cabe dentro del límite', () => {
    // $135.00 de interés de tres días contra un límite de $150.00.
    expect(checkSettlementTolerance(13_500n, 15_000n)).toEqual({ ok: true });
  });

  it('deja cerrar cuando el remanente es exactamente el límite', () => {
    expect(checkSettlementTolerance(15_000n, 15_000n)).toEqual({ ok: true });
  });

  it('rechaza un peso por encima del límite', () => {
    expect(checkSettlementTolerance(15_100n, 15_000n)).toEqual({ ok: false, reason: 'excede' });
  });

  it('con la tolerancia en cero no se condona nada: apagado no es sin límite', () => {
    expect(checkSettlementTolerance(100n, 0n)).toEqual({ ok: false, reason: 'sin-tolerancia' });
  });

  it('un pagaré sin saldo no tiene nada que condonar', () => {
    expect(checkSettlementTolerance(0n, 15_000n)).toEqual({ ok: false, reason: 'sin-saldo' });
  });

  it('un saldo negativo tampoco: sería asentar dinero que nadie debe', () => {
    expect(checkSettlementTolerance(-500n, 15_000n)).toEqual({ ok: false, reason: 'sin-saldo' });
  });
});
