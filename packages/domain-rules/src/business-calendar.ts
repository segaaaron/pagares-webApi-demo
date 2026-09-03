/**
 * Calendario de negocio (§12.1).
 * Toda comparación de fechas civiles ocurre en la zona del negocio, nunca en UTC:
 * con UTC-6, las últimas seis horas de cada día se marcarían vencidas un día antes.
 */
export const BUSINESS_TIMEZONE = 'America/Mexico_City';

/** Fecha civil (sin hora) en la zona del negocio, como 'YYYY-MM-DD'. */
export function civilDateIn(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return parts;
}

export function businessToday(now: Date): string {
  return civilDateIn(BUSINESS_TIMEZONE, now);
}

/** Días naturales entre dos fechas civiles. Negativo si `to` es anterior a `from`. */
export function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 86_400_000;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / MS_PER_DAY);
}

/** Días de atraso respecto a hoy. Cero mientras no haya vencido. */
export function daysOverdue(dueDate: string, now: Date): number {
  return Math.max(0, daysBetween(dueDate, businessToday(now)));
}

export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y + years, m - 1, d));
  return shifted.toISOString().slice(0, 10);
}
