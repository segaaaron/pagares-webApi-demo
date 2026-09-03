/**
 * Lectura de CSV para la importación de cartera (§24.5).
 *
 * Escrito a mano y no con una librería porque el formato que llega es siempre el
 * mismo —una exportación de Excel— y lo único que importa de verdad son las tres
 * cosas que un `split(',')` hace mal: comillas, comas dentro de comillas y el
 * BOM que Excel escribe al principio del archivo.
 *
 * Es puro: ni fechas del sistema, ni base de datos, ni excepciones de framework.
 */

export interface CsvTable {
  headers: string[];
  /** Cada fila indexada por cabecera, ya recortada. */
  rows: Record<string, string>[];
}

export function parseCsv(input: string): CsvTable {
  // Excel escribe un BOM (U+FEFF) al guardar como CSV UTF-8; si no se quita, la
  // primera cabecera se llama "\ufeffnombre" y ninguna columna cuadra.
  const text = input.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const records = splitRecords(text, detectDelimiter(text));
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = (records[0] ?? []).map((header) => header.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (const record of records.slice(1)) {
    // Una línea vacía al final de un archivo no es un registro sin datos.
    if (record.length === 1 && record[0]?.trim() === '') continue;

    const row: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      row[header] = (record[index] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * El separador se decide una vez, mirando la cabecera.
 *
 * Excel en configuración española escribe `;`. Aceptar los dos a la vez en cada
 * carácter parecía más tolerante, pero partía en dos un domicilio con punto y
 * coma: el formato del archivo es uno, y se elige antes de leer los datos.
 */
function detectDelimiter(text: string): ',' | ';' {
  const header = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));
  const commas = (header.match(/,/g) ?? []).length;
  const semicolons = (header.match(/;/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

/** Divide en registros respetando las comillas dobles y los saltos dentro de ellas. */
function splitRecords(text: string, delimiter: ',' | ';'): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        // Dos comillas seguidas dentro de un campo entrecomillado son una comilla.
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}
