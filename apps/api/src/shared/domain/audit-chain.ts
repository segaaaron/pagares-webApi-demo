import { createHash } from 'node:crypto';

export interface AuditEntry {
  actorId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown> | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Serialización canónica: claves ordenadas, en cualquier profundidad.
 *
 * Sin esto la cadena es inverificable. Postgres guarda `metadata` como `jsonb`,
 * que **no conserva el orden de las claves**: se escribe `{a, b, c}` y se lee
 * `{a, c, b}`. Mismo contenido, distinto `JSON.stringify`, distinto hash — y la
 * verificación reportaba una alteración que nunca ocurrió.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/**
 * Encadenado de la bitácora (§24.1). Función pura, sin base de datos: cada
 * registro incorpora el hash del anterior, de modo que alterar una fila invalida
 * todas las siguientes y la verificación lo detecta.
 */
export function chainHash(prevHash: string | null, entry: AuditEntry, createdAt: Date): string {
  return createHash('sha256')
    .update(
      [
        prevHash ?? '',
        entry.actorId,
        entry.action,
        entry.targetType,
        entry.targetId,
        canonicalJson(entry.metadata ?? {}),
        createdAt.toISOString(),
      ].join('|'),
    )
    .digest('hex');
}
