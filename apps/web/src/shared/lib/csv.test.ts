import { describe, expect, it } from 'vitest';
import { toCsv, csvResponse } from './csv';

/**
 * La exportación existe para abrirse en Excel en español. Cada una de estas
 * pruebas cubre una forma concreta de que el archivo llegue ilegible.
 */
describe('exportación a CSV', () => {
  it('separa con punto y coma, no con coma', () => {
    // Con coma, Excel en configuración española parte "1.234,50" en dos celdas.
    const csv = toCsv(['folio', 'importe'], [['PAG-2026-000001', '25000.00']]);
    expect(csv).toContain('folio;importe');
    expect(csv).toContain('PAG-2026-000001;25000.00');
  });

  it('abre con BOM para que los acentos no salgan rotos', () => {
    // Sin BOM, Excel lee UTF-8 como Latin-1 y "María" sale "MarÃ­a".
    const csv = toCsv(['nombre'], [['María López']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('María López');
  });

  it('entrecomilla el valor que lleva el separador', () => {
    const csv = toCsv(['nota'], [['Abono; parcial']]);
    expect(csv).toContain('"Abono; parcial"');
  });

  it('duplica las comillas de dentro', () => {
    // Una comilla suelta cierra el campo antes de tiempo y desplaza la fila
    // entera una columna.
    const csv = toCsv(['nota'], [['Dijo "pago el lunes"']]);
    expect(csv).toContain('"Dijo ""pago el lunes"""');
  });

  it('entrecomilla el valor con salto de línea', () => {
    const csv = toCsv(['nota'], [['Primera\nSegunda']]);
    expect(csv).toContain('"Primera\nSegunda"');
  });

  it('deja el valor limpio sin comillas', () => {
    expect(toCsv(['a'], [['simple']])).not.toContain('"');
  });
});

describe('respuesta de descarga', () => {
  it('se descarga como archivo y no se cachea', () => {
    const response = csvResponse('cartera-vencida', toCsv(['a'], [['1']]));
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="cartera-vencida.csv"',
    );
    // Un reporte cacheado enseñaría cifras viejas la próxima vez que se pida.
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
