import { describe, expect, it } from 'vitest';
import { amountToWords } from './amount-to-words.js';

describe('importe en letra', () => {
  it('escribe un centavo sin pluralizar el peso', () => {
    expect(amountToWords(1n)).toBe('CERO PESOS 01/100 M.N.');
  });

  it('usa el singular con exactamente un peso', () => {
    expect(amountToWords(100n)).toBe('UN PESO 00/100 M.N.');
  });

  it('apocopa veintiuno delante del sustantivo', () => {
    expect(amountToWords(2100n)).toBe('VEINTIÚN PESOS 00/100 M.N.');
  });

  it('escribe cien sin ciento', () => {
    expect(amountToWords(10_000n)).toBe('CIEN PESOS 00/100 M.N.');
  });

  it('usa la conjunción entre decena y unidad', () => {
    expect(amountToWords(4_500n)).toBe('CUARENTA Y CINCO PESOS 00/100 M.N.');
  });

  it('escribe el caso típico de un pagaré', () => {
    expect(amountToWords(2_500_000n)).toBe('VEINTICINCO MIL PESOS 00/100 M.N.');
  });

  it('no dice "uno mil"', () => {
    expect(amountToWords(100_000n)).toBe('MIL PESOS 00/100 M.N.');
  });

  it('escribe un millón en singular', () => {
    expect(amountToWords(100_000_000n)).toBe('UN MILLÓN PESOS 00/100 M.N.');
  });

  it('escribe millones en plural', () => {
    expect(amountToWords(250_000_000n)).toBe('DOS MILLONES QUINIENTOS MIL PESOS 00/100 M.N.');
  });

  it('conserva los centavos', () => {
    expect(amountToWords(2_500_050n)).toBe('VEINTICINCO MIL PESOS 50/100 M.N.');
  });

  it('rechaza importes negativos', () => {
    expect(() => amountToWords(-1n)).toThrow('amount_not_positive');
  });
});
