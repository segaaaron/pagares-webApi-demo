import { describe, expect, it } from 'vitest';
import { checkOtpState, cooldownRemaining, OTP_MAX_ATTEMPTS } from './otp-policy.js';

const now = new Date('2026-09-30T12:00:00Z');
const future = new Date('2026-09-30T12:05:00Z');
const past = new Date('2026-09-30T11:55:00Z');

describe('estado del código', () => {
  it('acepta un código vigente sin intentos gastados', () => {
    expect(checkOtpState({ expiresAt: future, attempts: 0, consumedAt: null }, now)).toBe('ok');
  });

  it('rechaza un código caducado', () => {
    expect(checkOtpState({ expiresAt: past, attempts: 0, consumedAt: null }, now)).toBe('expired');
  });

  it('rechaza un código ya usado: es de un solo uso', () => {
    expect(checkOtpState({ expiresAt: future, attempts: 0, consumedAt: past }, now)).toBe('expired');
  });

  it('bloquea tras agotar los intentos', () => {
    expect(
      checkOtpState({ expiresAt: future, attempts: OTP_MAX_ATTEMPTS, consumedAt: null }, now),
    ).toBe('attempts-exceeded');
  });

  it('permite el último intento disponible', () => {
    expect(
      checkOtpState({ expiresAt: future, attempts: OTP_MAX_ATTEMPTS - 1, consumedAt: null }, now),
    ).toBe('ok');
  });
});

describe('espera entre reenvíos', () => {
  it('no exige espera sin envío previo', () => {
    expect(cooldownRemaining(null, now)).toBe(0);
  });

  it('exige el resto del minuto tras un envío reciente', () => {
    expect(cooldownRemaining(new Date('2026-09-30T11:59:40Z'), now)).toBe(40);
  });

  it('no exige espera pasado el minuto', () => {
    expect(cooldownRemaining(new Date('2026-09-30T11:58:00Z'), now)).toBe(0);
  });
});
