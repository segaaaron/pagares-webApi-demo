import { describe, expect, it } from 'vitest';
import { money, shortDate, overdueLabel } from './format';

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
