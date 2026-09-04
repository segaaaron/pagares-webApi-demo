import { describe, expect, it } from 'vitest';
import { clabeCheckDigit, isValidClabe, normalizeClabe } from './clabe.js';

describe('CLABE', () => {
  it('acepta una CLABE cuyo dígito de control cuadra', () => {
    // Construida con el propio algoritmo: 17 dígitos conocidos + su control.
    const first17 = '01218000123456789';
    const clabe = `${first17}${clabeCheckDigit(first17)}`;
    expect(isValidClabe(clabe)).toBe(true);
  });

  it('rechaza un dígito de control equivocado', () => {
    const first17 = '01218000123456789';
    const wrong = `${first17}${(clabeCheckDigit(first17) + 1) % 10}`;
    expect(isValidClabe(wrong)).toBe(false);
  });

  it('rechaza cualquier longitud que no sea 18', () => {
    expect(isValidClabe('012180001234567')).toBe(false);
    expect(isValidClabe('0121800012345678901')).toBe(false);
  });

  it('detecta el error de tecleo más común: dos dígitos transpuestos', () => {
    const first17 = '01218000123456789';
    const clabe = `${first17}${clabeCheckDigit(first17)}`;
    const swapped = `${clabe.slice(0, 8)}${clabe[9]}${clabe[8]}${clabe.slice(10)}`;
    expect(swapped).not.toBe(clabe);
    expect(isValidClabe(swapped)).toBe(false);
  });

  it('tolera espacios y guiones, que es como se copia de un recibo', () => {
    const first17 = '01218000123456789';
    const clabe = `${first17}${clabeCheckDigit(first17)}`;
    expect(normalizeClabe(` ${clabe.slice(0, 4)}-${clabe.slice(4)} `)).toBe(clabe);
    expect(isValidClabe(` ${clabe.slice(0, 4)}-${clabe.slice(4)} `)).toBe(true);
  });
});
