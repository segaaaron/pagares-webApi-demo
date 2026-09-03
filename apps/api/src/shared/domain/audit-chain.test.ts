import { describe, expect, it } from 'vitest';
import { canonicalJson, chainHash, type AuditEntry } from './audit-chain.js';

const entry: AuditEntry = {
  actorId: 'admin-1',
  actorRole: 'ADMIN',
  action: 'note.write_off',
  targetType: 'PromissoryNote',
  targetId: 'note-1',
  metadata: { reasonCode: 'incobrable', amountCents: '500000' },
};

const at = new Date('2026-09-30T12:00:00Z');

describe('serialización canónica', () => {
  it('produce el mismo texto sin importar el orden de las claves', () => {
    // Es el fallo que hacía inverificable la cadena: Postgres guarda `metadata`
    // como jsonb y devuelve las claves en otro orden.
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('ordena también en objetos anidados', () => {
    expect(canonicalJson({ x: { z: 1, y: 2 } })).toBe(canonicalJson({ x: { y: 2, z: 1 } }));
  });

  it('conserva el orden de los arreglos, que sí es significativo', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe('cadena de la bitácora', () => {
  it('produce el mismo hash con la misma entrada', () => {
    expect(chainHash(null, entry, at)).toBe(chainHash(null, entry, at));
  });

  it('no depende del orden en que llegaron los metadatos', () => {
    const reordered: AuditEntry = {
      ...entry,
      metadata: { amountCents: '500000', reasonCode: 'incobrable' },
    };
    expect(chainHash(null, reordered, at)).toBe(chainHash(null, entry, at));
  });

  it('cambia si cambia el registro anterior', () => {
    expect(chainHash('abc', entry, at)).not.toBe(chainHash('def', entry, at));
  });

  it('cambia si se altera la acción', () => {
    expect(chainHash(null, { ...entry, action: 'note.void' }, at)).not.toBe(chainHash(null, entry, at));
  });

  it('cambia si se altera un valor de los metadatos', () => {
    const tampered = { ...entry, metadata: { reasonCode: 'otro', amountCents: '500000' } };
    expect(chainHash(null, tampered, at)).not.toBe(chainHash(null, entry, at));
  });

  it('cambia si se altera la fecha', () => {
    expect(chainHash(null, entry, new Date('2026-09-30T12:00:01Z'))).not.toBe(chainHash(null, entry, at));
  });
});
