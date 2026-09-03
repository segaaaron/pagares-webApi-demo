import { describe, expect, it } from 'vitest';
import {
  acceptsPayments,
  canTransition,
  deriveState,
  withClock,
  type DerivationInput,
} from './note-status.js';

const AT = new Date('2026-09-30T12:00:00Z');

const signed: DerivationInput = {
  amountCents: 2_500_000n,
  paidCents: 0n,
  daysOverdue: 0,
  hasSignature: true,
  signatureProcessing: false,
  voidedAt: null,
  writtenOffAt: null,
  renewedById: null,
  hasActiveSettlement: false,
};

describe('transiciones', () => {
  it('permite firmar un pagaré pendiente', () => {
    expect(canTransition('PENDING_SIGNATURE', 'PROCESSING_SIGNATURE')).toBe(true);
  });

  it('devuelve a pendiente si el procesamiento de la firma falla', () => {
    expect(canTransition('PROCESSING_SIGNATURE', 'PENDING_SIGNATURE')).toBe(true);
  });

  it('no permite salir de un estado final', () => {
    expect(canTransition('PAID', 'OVERDUE')).toBe(false);
    expect(canTransition('VOID', 'ISSUED')).toBe(false);
    expect(canTransition('RENEWED', 'OVERDUE')).toBe(false);
  });

  it('sólo permite salir del castigo por reversión explícita', () => {
    // Vuelve al estado que le toque por saldo: OVERDUE no se guarda (§11.2).
    expect(canTransition('WRITTEN_OFF', 'ISSUED')).toBe(true);
    expect(canTransition('WRITTEN_OFF', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransition('WRITTEN_OFF', 'OVERDUE')).toBe(false);
    expect(canTransition('WRITTEN_OFF', 'PAID')).toBe(false);
  });

  it('no permite saltar de pendiente de firma a pagado', () => {
    expect(canTransition('PENDING_SIGNATURE', 'PAID')).toBe(false);
  });
});

describe('admisión de abonos', () => {
  it('rechaza abonos sobre estados finales', () => {
    expect(acceptsPayments('PAID')).toBe(false);
    expect(acceptsPayments('VOID')).toBe(false);
    expect(acceptsPayments('RENEWED')).toBe(false);
  });

  it('acepta abonos sobre un castigado, como recuperación', () => {
    expect(acceptsPayments('WRITTEN_OFF')).toBe(true);
  });

  it('rechaza abonos antes de la firma', () => {
    expect(acceptsPayments('PENDING_SIGNATURE')).toBe(false);
  });
});

describe('derivación del estado', () => {
  it('está emitido cuando está firmado y sin abonos', () => {
    expect(deriveState(signed).status).toBe('ISSUED');
  });

  it('está pendiente de firma mientras no haya firma', () => {
    expect(deriveState({ ...signed, hasSignature: false }).status).toBe('PENDING_SIGNATURE');
  });

  it('está procesando mientras el worker comprime la firma', () => {
    expect(
      deriveState({ ...signed, hasSignature: false, signatureProcessing: true }).status,
    ).toBe('PROCESSING_SIGNATURE');
  });

  it('está abonado con pago parcial y sin atraso', () => {
    expect(deriveState({ ...signed, paidCents: 1_000_000n }).status).toBe('PARTIALLY_PAID');
  });

  it('está liquidado cuando el saldo llega a cero', () => {
    expect(deriveState({ ...signed, paidCents: 2_500_000n }).status).toBe('PAID');
  });

  it('el vencido gana sobre el abonado', () => {
    const state = deriveState({ ...signed, paidCents: 1_000_000n, daysOverdue: 5 });
    expect(state.status).toBe('OVERDUE');
  });

  it('un vencido reciente sigue en cartera vigente', () => {
    const state = deriveState({ ...signed, daysOverdue: 10 });
    expect(state.status).toBe('OVERDUE');
    expect(state.portfolioClass).toBe('VIGENTE');
  });

  it('a los 90 días pasa a cartera vencida', () => {
    expect(deriveState({ ...signed, daysOverdue: 90 }).portfolioClass).toBe('VENCIDA');
  });

  it('la anulación manda sobre cualquier saldo', () => {
    const state = deriveState({ ...signed, paidCents: 2_500_000n, voidedAt: AT });
    expect(state.status).toBe('VOID');
  });

  it('el castigo manda sobre el atraso', () => {
    const state = deriveState({ ...signed, daysOverdue: 200, writtenOffAt: AT });
    expect(state.status).toBe('WRITTEN_OFF');
  });

  it('el convenio activo manda sobre el atraso', () => {
    const state = deriveState({ ...signed, daysOverdue: 40, hasActiveSettlement: true });
    expect(state.status).toBe('RESTRUCTURED');
  });

  it('calcula el saldo como importe menos abonos', () => {
    expect(deriveState({ ...signed, paidCents: 1_000_000n }).balanceCents).toBe(1_500_000n);
  });
});

describe('withClock', () => {
  it('muestra vencido lo que tiene saldo y fecha pasada, aunque la columna diga otra cosa', () => {
    expect(withClock('ISSUED', 32)).toBe('OVERDUE');
    expect(withClock('PARTIALLY_PAID', 1)).toBe('OVERDUE');
  });

  it('no toca los estados que no dependen del reloj', () => {
    // Un convenio con la fecha original pasada sigue siendo convenio (§11.2).
    expect(withClock('RESTRUCTURED', 45)).toBe('RESTRUCTURED');
    expect(withClock('WRITTEN_OFF', 400)).toBe('WRITTEN_OFF');
    expect(withClock('PAID', 60)).toBe('PAID');
    expect(withClock('VOID', 60)).toBe('VOID');
    expect(withClock('PENDING_SIGNATURE', 10)).toBe('PENDING_SIGNATURE');
  });

  it('sin atraso deja el estado tal cual', () => {
    expect(withClock('ISSUED', 0)).toBe('ISSUED');
  });
});
