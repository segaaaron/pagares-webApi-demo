import type { ReactNode } from 'react';

/**
 * La tabla del sistema. Una sola.
 *
 * Antes cada pantalla escribía su `<table>` y ninguna se parecía a la otra:
 * cabeceras distintas, altos distintos, hover distinto. Aquí viven de una vez
 * el encabezado, la alineación, el separador y el vacío; una pantalla sólo
 * describe sus columnas y sus filas.
 *
 * Reglas fijas (estándar de tablas de datos): números a la derecha, texto a la
 * izquierda, cabecera callada salvo la columna activa, 16 px de aire lateral y
 * un separador de 1 px. Lo que cambia por pantalla son las columnas, no el
 * aspecto.
 */
export interface Column<Row> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right';
  /** Ancho fijo cuando la columna no debe estirarse (fechas, chips, acciones). */
  width?: string;
  cell: (row: Row) => ReactNode;
  /** Enlace de ordenación; si viene, la cabecera se vuelve pulsable. */
  sort?: { href: string; active: boolean; direction: 'asc' | 'desc' };
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  /** Franja de estado a la izquierda de la fila; devuelve la clase de color. */
  rowStripe,
  empty,
  footer,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowStripe?: (row: Row) => string;
  empty: ReactNode;
  footer?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="card overflow-hidden">
        <div className="px-4 py-10">{empty}</div>
        {footer}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10">
            <tr className="h-11 border-b border-line-strong text-left">
              {rowStripe ? <th scope="col" className="w-1 bg-surface-2 p-0" /> : null}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    column.sort
                      ? column.sort.active
                        ? column.sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                  style={column.width ? { width: column.width } : undefined}
                  className={`bg-surface-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-muted ${
                    column.align === 'right' ? 'text-right' : ''
                  }`}
                >
                  {column.sort ? (
                    <a
                      href={column.sort.href}
                      className={`inline-flex items-center gap-1 hover:text-ink ${
                        column.sort.active ? 'text-accent-ink' : ''
                      }`}
                    >
                      {column.header}
                      <span aria-hidden className={column.sort.active ? '' : 'opacity-0'}>
                        {column.sort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    </a>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                /*
                 * Alto mínimo común. El relleno ya era el mismo en todas las
                 * tablas, pero una celda de dos líneas —el teléfono y el correo
                 * del deudor— estiraba la fila y hacía parecer apretada la de
                 * pagarés, que es de una sola. Con un mínimo, las dos respiran
                 * igual y el contenido largo sigue pudiendo crecer.
                 */
                className="h-14 border-b border-line transition-colors last:border-0 hover:bg-accent-soft/40"
              >
                {rowStripe ? <td className={`w-1 p-0 ${rowStripe(row)}`} /> : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle ${column.align === 'right' ? 'text-right' : ''}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
