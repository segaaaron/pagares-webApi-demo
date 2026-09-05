/**
 * Formateo de presentación. El cálculo vive en el servidor (§1): aquí sólo se
 * pinta lo que ya viene decidido.
 */
const MONEY = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
});

// Sin `timeZone`: una fecha civil no tiene zona. Si se convirtiera, '2026-09-02'
// interpretado como medianoche UTC se mostraría como 1 de septiembre en México.
const DATE_SHORT = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

/** Los importes viajan como centavos en string: `bigint` no sobrevive a JSON. */
export function money(cents: string | bigint): string {
  const value = typeof cents === 'bigint' ? cents : BigInt(cents);
  return MONEY.format(Number(value) / 100);
}

/**
 * Formatea una fecha civil ('AAAA-MM-DD') tal cual, sin desplazarla.
 *
 * El error clásico: `new Date('2026-09-02')` es medianoche UTC, y al mostrarlo
 * en la zona de México retrocede un día. Un vencimiento mostrado con un día de
 * menos hace que el administrador cobre tarde.
 */
export function shortDate(civilDate: string): string {
  const [year, month, day] = civilDate.split('-').map(Number);
  if (!year || !month || !day) return civilDate;
  return DATE_SHORT.format(new Date(year, month - 1, day));
}

export function dateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

export function overdueLabel(days: number): string {
  if (days <= 0) return 'Al corriente';
  return days === 1 ? '1 día de atraso' : `${days} días de atraso`;
}

const HORA = new Intl.DateTimeFormat('es-MX', {
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

const DIA_LARGO = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Mexico_City',
});

/** Sólo la hora: el día va en el encabezado del grupo y repetirlo es ruido. */
export function time(iso: string): string {
  return HORA.format(new Date(iso));
}

const DIA_CIVIL = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' });

/**
 * El día de un instante, para agrupar: «Hoy», «Ayer» o la fecha con su día de
 * la semana. En la zona de México, que es donde ocurren las cosas (§12.1).
 *
 * `hoy` se recibe como fecha civil y no se lee del reloj aquí: el único sitio
 * del front que mira la hora del sistema es `todayInBusinessZone`.
 */
export function dayLabel(iso: string, hoy: string): string {
  const fecha = new Date(iso);
  const dia = DIA_CIVIL.format(fecha);
  if (dia === hoy) return 'Hoy';

  // El día anterior al civil de hoy, sin volver a mirar el reloj.
  const [a, m, d] = hoy.split('-').map(Number) as [number, number, number];
  const ayer = new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
  if (dia === ayer) return 'Ayer';

  return DIA_LARGO.format(fecha);
}
