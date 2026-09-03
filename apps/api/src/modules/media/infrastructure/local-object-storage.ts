import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { CLOCK, type Clock } from '@pagares/api-core';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import { isSafeKey, signPath } from '../domain/signed-path.js';
import type { ObjectStorage, StoredObject } from '../domain/ports/object-storage.js';

/**
 * Almacenamiento en un volumen del propio servidor.
 *
 * Alternativa a S3 para una instalación de un solo servidor: sin servicio
 * aparte, sin llaves de acceso y sin los ~100 MB de memoria que cuesta tener un
 * MinIO al lado. Los archivos viven en un volumen de Docker, así que sobreviven
 * a los despliegues —que es lo único que el disco del contenedor no garantiza.
 *
 * **Lo que hay que saber al elegirlo:** las copias de seguridad de ese volumen
 * son responsabilidad de quien opera el servidor, y no escala a varias
 * instancias de la API porque cada una vería sólo sus archivos. Para eso está el
 * adaptador de S3, que se activa con `STORAGE_DRIVER=s3` sin tocar el código.
 */
@Injectable()
export class LocalObjectStorage implements ObjectStorage {
  private readonly raiz: string;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.raiz = resolve(env.STORAGE_LOCAL_DIR);
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    const destino = this.rutaDe(key);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, body);

    return {
      key,
      byteSize: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.rutaDe(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.rutaDe(key), { force: true });
  }

  /**
   * Enlace temporal servido por la propia API (§8).
   *
   * S3 firma la URL y sirve el archivo él mismo; aquí lo sirve la API, así que
   * la URL apunta a `/files/...` con su firma y su caducidad.
   */
  async signedUrl(key: string, ttlSeconds?: number): Promise<string> {
    return this.firmar(key, 'get', ttlSeconds);
  }

  async presignPut(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    ttlSeconds?: number | undefined;
  }): Promise<{ url: string; key: string; expiresIn: number }> {
    const expiresIn = input.ttlSeconds ?? this.env.STORAGE_SIGNED_URL_TTL_SECONDS;
    return {
      url: await this.firmar(input.key, 'put', expiresIn),
      key: input.key,
      expiresIn,
    };
  }

  private async firmar(
    key: string,
    operacion: 'get' | 'put',
    ttlSeconds?: number,
  ): Promise<string> {
    const ttl = ttlSeconds ?? this.env.STORAGE_SIGNED_URL_TTL_SECONDS;
    const expira = Math.floor(this.clock.now().getTime() / 1000) + ttl;
    // La firma usa el secreto de los tokens: un secreto menos que gestionar, y
    // rotarlo invalida los enlaces vivos, que es el comportamiento correcto.
    const firma = signPath(this.env.JWT_ACCESS_SECRET, key, expira, operacion);

    const base = this.env.API_PUBLIC_URL.replace(/\/+$/, '');
    return `${base}/api/v1/files/${key}?expires=${expira}&signature=${firma}`;
  }

  /**
   * De clave a ruta en disco, comprobando dos veces.
   *
   * Primero el formato de la clave, y después que la ruta resultante siga dentro
   * de la raíz: la segunda comprobación es la que atrapa lo que la primera no
   * previó.
   */
  private rutaDe(key: string): string {
    if (!isSafeKey(key)) throw new Error(`Clave de almacenamiento inválida: ${key}`);

    const destino = resolve(join(this.raiz, key));
    if (destino !== this.raiz && !destino.startsWith(this.raiz + sep)) {
      throw new Error('La clave apunta fuera del almacenamiento');
    }
    return destino;
  }
}
