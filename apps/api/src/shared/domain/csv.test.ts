import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('lectura de CSV', () => {
  it('normaliza las cabeceras a minúsculas y recorta los campos', () => {
    const table = parseCsv('Nombre, Correo\n Juan Pérez , juan@ejemplo.mx ');
    expect(table.headers).toEqual(['nombre', 'correo']);
    expect(table.rows).toEqual([{ nombre: 'Juan Pérez', correo: 'juan@ejemplo.mx' }]);
  });

  it('respeta las comas dentro de comillas', () => {
    const table = parseCsv('nombre,domicilio\n"Pérez, Juan","Av. Madero 100, Morelia"');
    expect(table.rows[0]).toEqual({
      nombre: 'Pérez, Juan',
      domicilio: 'Av. Madero 100, Morelia',
    });
  });

  it('entiende la comilla escapada y el salto de línea dentro del campo', () => {
    const table = parseCsv('nombre,nota\n"Juan ""El Güero""","Primera línea\nSegunda"');
    expect(table.rows[0]?.nombre).toBe('Juan "El Güero"');
    expect(table.rows[0]?.nota).toBe('Primera línea\nSegunda');
  });

  it('quita el BOM que escribe Excel', () => {
    const table = parseCsv('\ufeffnombre,correo\nJuan,juan@ejemplo.mx');
    expect(table.headers[0]).toBe('nombre');
  });

  it('usa el punto y coma cuando es el separador de la cabecera', () => {
    const table = parseCsv('nombre;domicilio\nJuan;Av. Madero 100; interior 3');
    expect(table.rows[0]?.nombre).toBe('Juan');
    expect(table.headers).toEqual(['nombre', 'domicilio']);
  });

  it('un domicilio con punto y coma no parte la fila cuando el separador es coma', () => {
    const table = parseCsv('nombre,domicilio\nJuan,"Madero 100; int. 3"');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.domicilio).toBe('Madero 100; int. 3');
  });

  it('ignora la línea vacía del final', () => {
    const table = parseCsv('nombre\nJuan\n');
    expect(table.rows).toHaveLength(1);
  });

  it('un archivo vacío no es un error, es una tabla sin filas', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});
