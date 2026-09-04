import { describe, expect, it } from 'vitest';
import { assertValidAmount, formatMxn, money, MAX_AMOUNT_CENTS } from './money.js';

/**
 * Dinero en centavos enteros (§12.1). Estas pruebas fijan las dos formas en que
 * el dinero sale de la API: el texto que se lee y el número con el que se
 * calcula. Que el segundo faltara en las rutas del cliente obligaba a la
 * aplicación a deshacer el formato para sumar, y eso es un error de céntimos
 * esperando a ocurrir.
 */
describe('formato de pesos', () => {
  it('separa los miles y siempre pone dos decimales', () => {
    expect(formatMxn(4_500_000n)).toBe('$45,000.00 MXN');
    expect(formatMxn(100n)).toBe('$1.00 MXN');
  });

  it('no pierde los centavos que no llegan a diez', () => {
    // 25 004 centavos son $250.04, no $250.4.
    expect(formatMxn(25_004n)).toBe('$250.04 MXN');
  });

  it('el cero se escribe entero', () => {
    expect(formatMxn(0n)).toBe('$0.00 MXN');
  });

  it('conserva el signo del negativo', () => {
    // Una reversa de abono y un descuadre a favor llegan en negativo (§12.2).
    expect(formatMxn(-30_000n)).toBe('-$300.00 MXN');
  });
});

describe('importe para el cliente', () => {
  it('lleva el número, la moneda y el texto', () => {
    // El texto es para leerlo; los centavos son para calcular con ellos. Sin el
    // número, la aplicación tendría que parsear "$45,000.00 MXN", que se rompe
    // con el primer separador distinto.
    expect(money(4_500_000n)).toEqual({
      cents: '4500000',
      currency: 'MXN',
      formatted: '$45,000.00 MXN',
    });
  });

  it('los centavos viajan como cadena', () => {
    // Un pagaré grande supera el entero seguro de JavaScript: como número, el
    // cliente recibiría un importe redondeado (§12.1).
    expect(money(MAX_AMOUNT_CENTS).cents).toBe('99999999999');
    expect(typeof money(1n).cents).toBe('string');
  });

  it('el cero también se serializa, no se omite', () => {
    // Un saldo liquidado es cero, y la pantalla tiene que poder decirlo.
    expect(money(0n)).toEqual({ cents: '0', currency: 'MXN', formatted: '$0.00 MXN' });
  });

  it('el negativo conserva el signo en las dos formas', () => {
    expect(money(-30_000n)).toEqual({
      cents: '-30000',
      currency: 'MXN',
      formatted: '-$300.00 MXN',
    });
  });
});

describe('límites del importe', () => {
  it('rechaza cero y negativos', () => {
    expect(() => assertValidAmount(0n)).toThrow('amount_not_positive');
    expect(() => assertValidAmount(-1n)).toThrow('amount_not_positive');
  });

  it('rechaza lo que no cabe', () => {
    expect(() => assertValidAmount(MAX_AMOUNT_CENTS + 1n)).toThrow('amount_too_large');
  });

  it('acepta justo el máximo', () => {
    expect(() => assertValidAmount(MAX_AMOUNT_CENTS)).not.toThrow();
  });
});
