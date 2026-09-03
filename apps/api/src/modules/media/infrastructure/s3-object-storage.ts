import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import type { ObjectStorage, StoredObject } from '../domain/ports/object-storage.js';

/**
 * Adaptador de almacenamiento. Habla el protocolo de S3, así que sirve igual
 * para MinIO —lo que usamos— que para S3 o R2 si algún día cambia el destino.
 */
@Injectable()
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(@Inject(ENV) private readonly env: Env) {
    /*
     * Las variables de S3 son opcionales en el esquema porque la instalación por
     * omisión guarda en disco. Quien elige este adaptador tiene que traerlas
     * todas: mejor morir al arrancar que descubrirlo cuando alguien firme.
     */
    for (const [nombre, valor] of Object.entries({
      STORAGE_ENDPOINT: env.STORAGE_ENDPOINT,
      STORAGE_BUCKET: env.STORAGE_BUCKET,
      STORAGE_ACCESS_KEY: env.STORAGE_ACCESS_KEY,
      STORAGE_SECRET_KEY: env.STORAGE_SECRET_KEY,
    })) {
      if (!valor) throw new Error(`STORAGE_DRIVER=s3 exige ${nombre}`);
    }

    this.client = new S3Client({
      endpoint: env.STORAGE_ENDPOINT as string,
      region: env.STORAGE_REGION,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY as string,
        secretAccessKey: env.STORAGE_SECRET_KEY as string,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.STORAGE_BUCKET as string,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return {
      key,
      byteSize: body.byteLength,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.env.STORAGE_BUCKET as string, Key: key }),
    );
    // `transformToByteArray` evita montar el stream a mano y respeta el límite
    // de tamaño del propio SDK.
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`El objeto ${key} no tiene contenido`);
    return Buffer.from(bytes);
  }

  /**
   * Subida directa (§8.5).
   *
   * El tipo va firmado; el tamaño **no**. Firmar `ContentLength` fija la longitud
   * exacta —no un máximo—, así que una URL autorizada para 20 MB sólo aceptaría
   * ficheros de justo 20 MB. El límite se aplica al confirmar, que es donde se
   * pesa el objeto de verdad y se borra si excede su perfil.
   */
  async presignPut(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    ttlSeconds?: number | undefined;
  }): Promise<{ url: string; key: string; expiresIn: number }> {
    const expiresIn = input.ttlSeconds ?? this.env.STORAGE_SIGNED_URL_TTL_SECONDS;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.env.STORAGE_BUCKET as string,
        Key: input.key,
        ContentType: input.contentType,
      }),
      { expiresIn },
    );
    return { url, key: input.key, expiresIn };
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.env.STORAGE_BUCKET as string, Key: key }),
    );
  }

  async signedUrl(key: string, ttlSeconds?: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.env.STORAGE_BUCKET as string, Key: key }),
      { expiresIn: ttlSeconds ?? this.env.STORAGE_SIGNED_URL_TTL_SECONDS },
    );
  }
}
