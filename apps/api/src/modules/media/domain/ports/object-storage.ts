export interface StoredObject {
  key: string;
  byteSize: number;
  sha256: string;
}

/** Puerto de almacenamiento (§8). MinIO hoy; S3 o R2 sin tocar el dominio. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  /** Trae el objeto al proceso. Lo necesita el paquete legal, que empaqueta (§24.5). */
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** URL temporal: el bucket es privado y copiar la dirección no da acceso. */
  signedUrl(key: string, ttlSeconds?: number): Promise<string>;
  /**
   * URL de subida directa para anexos grandes (§8.5).
   *
   * El tipo se firma con la URL. El tamaño se comprueba al confirmar: firmarlo
   * fijaría la longitud exacta, no un máximo, y el cliente no podría subir un
   * fichero más pequeño que el límite.
   */
  presignPut(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    ttlSeconds?: number | undefined;
  }): Promise<{ url: string; key: string; expiresIn: number }>;
}

export const OBJECT_STORAGE = Symbol('ObjectStorage');
