import { describe, expect, it } from 'vitest';
import {
  assertChangeQuota,
  assertPasswordStrength,
  isLocked,
  nextLockout,
  PasswordChangeLimitError,
  PasswordTooWeakError,
} from './password-policy.js';

const now = new Date('2026-09-30T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('fuerza de la contraseña', () => {
  it('rechaza menos de 12 caracteres', () => {
    expect(() => assertPasswordStrength('corta123')).toThrow(PasswordTooWeakError);
  });

  it('acepta 12 caracteres', () => {
    expect(() => assertPasswordStrength('abcdef123456')).not.toThrow();
  });

  it('rechaza un solo carácter repetido', () => {
    expect(() => assertPasswordStrength('aaaaaaaaaaaaaa')).toThrow(PasswordTooWeakError);
  });
});

describe('cuota de cambios', () => {
  it('permite el tercer cambio de la semana', () => {
    expect(() => assertChangeQuota([daysAgo(1), daysAgo(2)], now)).not.toThrow();
  });

  it('bloquea el cuarto cambio dentro de la ventana', () => {
    expect(() => assertChangeQuota([daysAgo(1), daysAgo(2), daysAgo(3)], now)).toThrow(
      PasswordChangeLimitError,
    );
  });

  it('no cuenta los cambios fuera de la ventana de 7 días', () => {
    expect(() => assertChangeQuota([daysAgo(8), daysAgo(9), daysAgo(10)], now)).not.toThrow();
  });

  it('indica cuándo se libera la cuota', () => {
    try {
      assertChangeQuota([daysAgo(1), daysAgo(2), daysAgo(3)], now);
      expect.unreachable('debió lanzar');
    } catch (error) {
      // Se libera 7 días después del cambio más antiguo, no del más reciente.
      expect((error as PasswordChangeLimitError).availableAt.toISOString().slice(0, 10)).toBe('2026-10-04');
    }
  });
});

describe('bloqueo por intentos', () => {
  it('no bloquea antes del quinto fallo', () => {
    expect(nextLockout(4, now)).toBeNull();
  });

  it('bloquea 5 horas al quinto fallo', () => {
    const until = nextLockout(5, now);
    expect(until?.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it('el bloqueo se levanta solo al expirar', () => {
    expect(isLocked(new Date('2026-09-30T11:00:00Z'), now)).toBe(false);
    expect(isLocked(new Date('2026-09-30T13:00:00Z'), now)).toBe(true);
  });

  it('sin fecha de bloqueo, la cuenta está libre', () => {
    expect(isLocked(null, now)).toBe(false);
  });
});
