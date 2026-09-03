import { businessToday } from '@pagares/domain-rules';

/**
 * Fecha de hoy en la zona del negocio (§12.1).
 *
 * Único lugar del front que lee el reloj del sistema. Usar `new Date()` suelto
 * daría la fecha UTC del servidor: a partir de las 18:00 de México ya es el día
 * siguiente en UTC, y el formulario de abono propondría una fecha futura.
 */
export function todayInBusinessZone(): string {
  // eslint-disable-next-line no-restricted-syntax
  return businessToday(new Date());
}
