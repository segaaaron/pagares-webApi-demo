/**
 * La CLABE: 18 dígitos con dígito de control (norma del Banco de México).
 *
 * Importa porque este número viaja al teléfono del deudor y a los correos de
 * cobro. Un dígito mal tecleado en Ajustes no da error en ninguna parte: da una
 * transferencia a una cuenta que no es, y ese dinero no vuelve solo. El dígito
 * verificador no prueba que la cuenta exista, pero atrapa el error de tecleo,
 * que es el que ocurre de verdad.
 */

/** Pesos fijos de la norma, aplicados cíclicamente a los 17 primeros dígitos. */
const WEIGHTS = [3, 7, 1] as const;

export const CLABE_LENGTH = 18;

/** Sólo los dígitos: se acepta escrita con espacios o guiones, como en un recibo. */
export function normalizeClabe(value: string): string {
  return value.replace(/\D/g, '');
}

/** El dígito de control que le corresponde a los 17 primeros dígitos. */
export function clabeCheckDigit(first17: string): number {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    // El producto se trunca a su unidad ANTES de sumar: así lo define la norma.
    sum += ((Number(first17[i]) * WEIGHTS[i % 3]!) % 10);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Si el número puede ser una CLABE. No consulta a ningún banco: comprueba
 * longitud y dígito de control, que es lo que se puede saber sin red.
 */
export function isValidClabe(value: string): boolean {
  const digits = normalizeClabe(value);
  if (digits.length !== CLABE_LENGTH) return false;
  return clabeCheckDigit(digits.slice(0, 17)) === Number(digits[17]);
}
