import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Enlaces temporales para los archivos guardados en disco (§8).
 *
 * El almacenamiento S3 firma sus propias URLs; el disco no sabe hacerlo, así que
 * la firma se hace aquí: un HMAC sobre la clave y el instante de caducidad. Sin
 * esto, quien conociera la ruta de una firma la vería para siempre, que es justo
 * lo que el bucket privado evita.
 *
 * Es puro: se prueba sin servidor, sin disco y sin reloj del sistema.
 */
export interface SignedPath {
  key: string;
  expiresAt: number;
  signature: string;
}

export function signPath(
  secret: string,
  key: string,
  expiresAt: number,
  operation: 'get' | 'put' = 'get',
): string {
  return createHmac('sha256', secret)
    .update(`${operation}:${key}:${expiresAt}`)
    .digest('base64url');
}

export type SignatureCheck =
  | { valid: true }
  | { valid: false; reason: 'expired' | 'mismatch' | 'malformed' };

export function verifyPath(input: {
  secret: string;
  key: string;
  expiresAt: string | undefined;
  signature: string | undefined;
  nowSeconds: number;
  operation?: 'get' | 'put';
}): SignatureCheck {
  if (!input.expiresAt || !input.signature) return { valid: false, reason: 'malformed' };

  const expiresAt = Number(input.expiresAt);
  if (!Number.isFinite(expiresAt)) return { valid: false, reason: 'malformed' };

  // La caducidad se comprueba antes que el HMAC: un enlace vencido no merece el
  // gasto de la comparación.
  if (expiresAt < input.nowSeconds) return { valid: false, reason: 'expired' };

  const esperada = signPath(input.secret, input.key, expiresAt, input.operation ?? 'get');
  const a = Buffer.from(input.signature);
  const b = Buffer.from(esperada);

  // Tiempo constante: comparar con `===` filtra el prefijo correcto por lo que
  // tarda en fallar.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'mismatch' };
  }
  return { valid: true };
}

/**
 * Una clave de almacenamiento válida: sólo lo que este sistema genera.
 *
 * La clave llega por la URL, así que hay que tratarla como entrada hostil. Sin
 * esta comprobación, `../../etc/passwd` sería una clave perfectamente aceptable
 * y el endpoint de descarga serviría cualquier archivo de la máquina.
 */
export function isSafeKey(key: string): boolean {
  if (key.length === 0 || key.length > 200) return false;
  if (key.startsWith('/') || key.includes('..') || key.includes('\\')) return false;
  if (key.includes('\0')) return false;
  return /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(key);
}
