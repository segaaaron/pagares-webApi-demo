import { describe, expect, it } from 'vitest';
import { isSafeKey, signPath, verifyPath } from './signed-path.js';

const SECRETO = 'un-secreto-de-pruebas-suficientemente-largo';
const AHORA = 1_772_000_000;
const CLAVE = 'signature/2026-09-03/a1b2c3.webp';

describe('enlaces temporales de archivos', () => {
  it('acepta una firma vigente', () => {
    const expira = AHORA + 900;
    const firma = signPath(SECRETO, CLAVE, expira);
    expect(
      verifyPath({ secret: SECRETO, key: CLAVE, expiresAt: String(expira), signature: firma, nowSeconds: AHORA }),
    ).toEqual({ valid: true });
  });

  it('rechaza una firma caducada', () => {
    const expira = AHORA - 1;
    const firma = signPath(SECRETO, CLAVE, expira);
    expect(
      verifyPath({ secret: SECRETO, key: CLAVE, expiresAt: String(expira), signature: firma, nowSeconds: AHORA }),
    ).toEqual({ valid: false, reason: 'expired' });
  });

  it('la firma de un archivo no sirve para otro', () => {
    const expira = AHORA + 900;
    const firma = signPath(SECRETO, CLAVE, expira);
    expect(
      verifyPath({
        secret: SECRETO,
        key: 'signature/2026-09-03/otro.webp',
        expiresAt: String(expira),
        signature: firma,
        nowSeconds: AHORA,
      }),
    ).toEqual({ valid: false, reason: 'mismatch' });
  });

  it('la firma de lectura no sirve para escribir', () => {
    const expira = AHORA + 900;
    const lectura = signPath(SECRETO, CLAVE, expira, 'get');
    expect(
      verifyPath({
        secret: SECRETO,
        key: CLAVE,
        expiresAt: String(expira),
        signature: lectura,
        nowSeconds: AHORA,
        operation: 'put',
      }),
    ).toEqual({ valid: false, reason: 'mismatch' });
  });

  it('no se puede alargar la caducidad sin volver a firmar', () => {
    const expira = AHORA + 900;
    const firma = signPath(SECRETO, CLAVE, expira);
    expect(
      verifyPath({
        secret: SECRETO,
        key: CLAVE,
        expiresAt: String(expira + 86_400),
        signature: firma,
        nowSeconds: AHORA,
      }),
    ).toEqual({ valid: false, reason: 'mismatch' });
  });

  it('sin firma o sin caducidad, no pasa', () => {
    expect(
      verifyPath({ secret: SECRETO, key: CLAVE, expiresAt: undefined, signature: 'x', nowSeconds: AHORA }).valid,
    ).toBe(false);
    expect(
      verifyPath({ secret: SECRETO, key: CLAVE, expiresAt: 'ayer', signature: 'x', nowSeconds: AHORA }),
    ).toEqual({ valid: false, reason: 'malformed' });
  });
});

describe('claves de almacenamiento', () => {
  it('acepta las que genera el sistema', () => {
    expect(isSafeKey('signature/2026-09-03/a1b2c3.webp')).toBe(true);
    expect(isSafeKey('legal-exhibit/2026-09-03/f4e5d6.pdf')).toBe(true);
  });

  it('rechaza el paseo por directorios', () => {
    // Sin esto, el endpoint de descarga serviría cualquier archivo del servidor.
    expect(isSafeKey('../../etc/passwd')).toBe(false);
    expect(isSafeKey('signature/../../../etc/shadow')).toBe(false);
    expect(isSafeKey('/etc/passwd')).toBe(false);
    expect(isSafeKey('C:\\Windows\\system32')).toBe(false);
    expect(isSafeKey('firma\0.webp')).toBe(false);
    expect(isSafeKey('')).toBe(false);
  });
});
