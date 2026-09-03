import 'server-only';

/**
 * CSV para Excel en español.
 *
 * Dos decisiones que parecen manías y no lo son: el separador es `;` porque
 * Excel en configuración regional española trata la coma como decimal y
 * partiría cada importe en dos columnas; y el archivo abre con BOM porque sin
 * él Excel lee el UTF-8 como Latin-1 y "María" sale "MarÃ­a".
 */
export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string): string =>
    /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines = [headers.map(escape).join(';'), ...rows.map((row) => row.map(escape).join(';'))];
  const BOM = '\uFEFF';
  return `${BOM}${lines.join('\n')}`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
