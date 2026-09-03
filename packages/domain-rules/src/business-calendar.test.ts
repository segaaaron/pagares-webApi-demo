import { describe, expect, it } from 'vitest';
import { addYears, businessToday, daysBetween, daysOverdue } from './business-calendar.js';

describe('calendario de negocio', () => {
  it('usa la fecha de México, no la de UTC', () => {
    // 2026-10-01T04:00:00Z son las 22:00 del 30 de septiembre en México.
    // Con UTC el pagaré se marcaría vencido un día antes de tiempo.
    expect(businessToday(new Date('2026-10-01T04:00:00Z'))).toBe('2026-09-30');
  });

  it('cambia de día a las 06:00 UTC', () => {
    expect(businessToday(new Date('2026-10-01T05:59:00Z'))).toBe('2026-09-30');
    expect(businessToday(new Date('2026-10-01T06:00:00Z'))).toBe('2026-10-01');
  });

  it('cuenta días naturales entre fechas civiles', () => {
    expect(daysBetween('2026-09-30', '2026-10-30')).toBe(30);
  });

  it('cuenta bien a través de un año bisiesto', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('no reporta atraso antes del vencimiento', () => {
    expect(daysOverdue('2026-10-30', new Date('2026-10-01T12:00:00Z'))).toBe(0);
  });

  it('reporta el atraso en días naturales', () => {
    expect(daysOverdue('2026-09-30', new Date('2026-10-10T12:00:00Z'))).toBe(10);
  });

  it('calcula el plazo de prescripción a tres años', () => {
    expect(addYears('2026-09-30', 3)).toBe('2029-09-30');
  });
});
