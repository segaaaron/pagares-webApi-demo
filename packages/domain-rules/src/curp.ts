/**
 * CURP: la Clave Única de Registro de Población (§25).
 *
 * Dieciocho caracteres con estructura: cuatro letras del nombre, seis dígitos de
 * la fecha de nacimiento, el sexo, dos letras de la entidad, tres consonantes
 * internas, un homónimo y un dígito verificador.
 *
 * Se valida la **forma**, no la existencia: comprobar que una CURP corresponde a
 * una persona real exige consultar a RENAPO, y este sistema no habla con RENAPO.
 * Lo que sí evita esto es que un dedazo entre en la base y luego no cuadre con
 * el documento de identidad que alguien tenga delante.
 */

/**
 * La estructura oficial.
 *
 * El mes se limita a 01-12 y el día a 01-31 —no se comprueba que febrero tenga
 * veintinueve: eso lo dice el dígito verificador, y rechazar una CURP válida es
 * peor que aceptar una imposible—. El sexo admite `H`, `M` y `X`.
 */
const FORMA =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

/**
 * Palabras que la CURP no puede formar en sus cuatro primeras letras.
 *
 * RENAPO las sustituye por una X al generarla, así que una CURP que empiece por
 * una de ellas está mal transcrita. Va en la validación porque es exactamente el
 * tipo de error que nadie ve al teclear y que revienta el día que hay que
 * cotejar la ficha con una identificación.
 */
const MALSONANTES = new Set([
  'BACA', 'BAKA', 'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO',
  'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO', 'FALO', 'FETO',
  'GETA', 'GUEI', 'GUEY', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KAKA', 'KAKO',
  'KOGE', 'KOGI', 'KOJA', 'KOJE', 'KOJI', 'KOJO', 'KOLA', 'KULO', 'LILO', 'LOCA',
  'LOCO', 'LOKA', 'LOKO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MIAR', 'MION',
  'MOCO', 'MOKO', 'MULA', 'MULO', 'NACA', 'NACO', 'PEDA', 'PEDO', 'PENE', 'PIPI',
  'PITO', 'POPO', 'PUTA', 'PUTO', 'QULO', 'RATA', 'ROBA', 'ROBE', 'ROBO', 'RUIN',
  'SENO', 'TETA', 'VACA', 'VAGA', 'VAGO', 'VAKA', 'VUEI', 'VUEY', 'WUEI', 'WUEY',
]);

/** Mayúsculas y sin espacios, que es como se escribe y como se guarda. */
export function normalizeCurp(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidCurp(value: string): boolean {
  const curp = normalizeCurp(value);
  if (!FORMA.test(curp)) return false;
  if (MALSONANTES.has(curp.slice(0, 4))) return false;
  return checkDigit(curp) === curp[17];
}

/**
 * El dígito verificador, tal como lo calcula RENAPO.
 *
 * Cada carácter vale su posición en el alfabeto oficial, se multiplica por lo
 * que queda de los dieciocho y la suma se completa a la decena. Es lo que
 * convierte un dedazo en un rechazo en vez de en una ficha con la clave de otro.
 */
const ALFABETO = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

function checkDigit(curp: string): string {
  let suma = 0;
  for (let i = 0; i < 17; i += 1) {
    suma += ALFABETO.indexOf(curp[i] as string) * (18 - i);
  }
  const digito = (10 - (suma % 10)) % 10;
  return String(digito);
}
