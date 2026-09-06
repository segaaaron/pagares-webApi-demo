import { describe, expect, it } from 'vitest';
import { isValidCurp, normalizeCurp } from './curp.js';

/**
 * La CURP se valida por su forma y su dígito, no por su existencia.
 *
 * Comprobar que corresponde a una persona real exige consultar a RENAPO y este
 * sistema no habla con RENAPO. Lo que se evita aquí es que un dedazo entre en la
 * base y no cuadre el día que hay que cotejar la ficha con una identificación.
 */
describe('CURP', () => {
  it('acepta una bien formada', () => {
    expect(isValidCurp('SABM800101HMNRLG00')).toBe(true);
  });

  it('normaliza a mayúsculas y sin espacios', () => {
    expect(normalizeCurp('  sabm800101hmnrlg00 ')).toBe('SABM800101HMNRLG00');
    expect(isValidCurp(' sabm800101hmnrlg00 ')).toBe(true);
  });

  it('rechaza un dígito verificador que no cuadra', () => {
    // Es el error que nadie ve al teclear y que revienta meses después.
    expect(isValidCurp('SABM800101HMNRLG07')).toBe(false);
  });

  it('rechaza la longitud que no es dieciocho', () => {
    expect(isValidCurp('SABM800101HMNRLG0')).toBe(false);
    expect(isValidCurp('SABM800101HMNRLG000')).toBe(false);
  });

  it('rechaza un mes o un día imposibles', () => {
    expect(isValidCurp('SABM801301HMNRLG06')).toBe(false);
    expect(isValidCurp('SABM800132HMNRLG01')).toBe(false);
  });

  it('rechaza un sexo que no existe', () => {
    expect(isValidCurp('SABM800101ZMNRLG08')).toBe(false);
  });

  it('rechaza las palabras que RENAPO sustituye por X', () => {
    // Una CURP que empiece por una de ellas está mal transcrita: la oficial
    // lleva X en la segunda letra.
    expect(isValidCurp('BUEI800101HMNRLG09')).toBe(false);
  });

  it('rechaza vocales donde no las hay', () => {
    // La segunda posición es la primera vocal interna del apellido.
    expect(isValidCurp('SZBM800101HMNRLG08')).toBe(false);
  });
});
