/**
 * Cursor opaco de paginación (§25.4).
 * Codifica el valor de orden y el id de desempate: sin el id, dos filas con la
 * misma fecha se repiten o se pierden entre páginas.
 */
export interface CursorPayload {
  readonly value: string;
  readonly id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CursorPayload).value === 'string' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null; // cursor manipulado: se trata como si no hubiera cursor
  }
}
