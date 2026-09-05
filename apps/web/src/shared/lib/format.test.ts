import { describe, expect, it } from 'vitest';
import { dayLabel, money, overdueLabel, shortDate } from './format';

describe('formato de fechas civiles', () => {
  it('no retrocede un día al formatear', () => {
    // Regresión: `new Date('2026-09-02')` es medianoche UTC y en México se
    // mostraba como 1 de septiembre. Un vencimiento con un día de menos hace
    // que el administrador cobre tarde.
    expect(shortDate('2026-09-02')).toContain('02');
  });

  it('conserva el mes y el año', () => {
    expect(shortDate('2026-01-31')).toContain('31');
    expect(shortDate('2026-01-31')).toContain('2026');
  });
});

describe('formato de dinero', () => {
  it('convierte centavos a pesos', () => {
    expect(money('2500000')).toContain('25,000');
  });

  it('acepta el importe como bigint', () => {
    expect(money(100n)).toContain('1.00');
  });
});

describe('etiqueta de atraso', () => {
  it('usa singular con un día', () => {
    expect(overdueLabel(1)).toBe('1 día de atraso');
  });

  it('dice al corriente sin atraso', () => {
    expect(overdueLabel(0)).toBe('Al corriente');
  });
});

describe('el día de un movimiento', () => {
  it('dice «Hoy» y «Ayer» en vez de la fecha', () => {
    // Encabezar cada grupo con «4 sep 2026» obliga a calcular si eso fue hoy.
    expect(dayLabel('2026-09-04T15:00:00.000Z', '2026-09-04')).toBe('Hoy');
    expect(dayLabel('2026-09-03T15:00:00.000Z', '2026-09-04')).toBe('Ayer');
  });

  it('lo anterior lleva su fecha con el día de la semana', () => {
    expect(dayLabel('2026-09-01T15:00:00.000Z', '2026-09-04')).toContain('septiembre');
  });

  it('agrupa por el día de México, no por el de UTC', () => {
    /*
     * Un abono de las 20:00 de México es del día siguiente en UTC. Si se
     * agrupara por UTC, aparecería bajo «mañana».
     */
    expect(dayLabel('2026-09-05T02:00:00.000Z', '2026-09-04')).toBe('Hoy');
  });
});
