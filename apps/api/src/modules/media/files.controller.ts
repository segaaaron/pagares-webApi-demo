import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { Request, Response } from 'express';
import { Public } from '../../shared/http/auth.guard.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { isSafeKey, verifyPath } from './domain/signed-path.js';
import { OBJECT_STORAGE, type ObjectStorage } from './domain/ports/object-storage.js';

/** Tope de una subida directa: el perfil más generoso admite 20 MB (§8.3). */
const MAX_SUBIDA_BYTES = 21 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};

/**
 * Sirve los archivos cuando el almacenamiento es un volumen del servidor (§8).
 *
 * `@Public()` justificado: la autorización **es la firma del enlace**, no una
 * sesión. Es el mismo trato que da una URL prefirmada de S3, sólo que aquí la
 * comprueba la API: sin firma válida y sin caducidad vigente, no se sirve nada.
 * Así el `<img>` de un panel o la app de iOS pueden pedir el archivo sin
 * mandar el token de sesión por la URL, que es donde acabaría en los logs.
 *
 * Con `STORAGE_DRIVER=s3` estas rutas siguen existiendo pero nadie las usa: las
 * URLs firmadas apuntan al bucket.
 */
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Public()
  @Get('*key')
  async descargar(
    @Param('key') partes: string[] | string,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const key = this.claveDe(partes);
    this.comprobarFirma(key, expires, signature, 'get');

    const ruta = this.rutaDe(key);
    const info = await stat(ruta).catch(() => null);
    if (!info?.isFile()) throw new NotFoundException('El archivo no existe');

    response
      .status(200)
      .setHeader('Content-Type', TIPOS[key.split('.').pop() ?? ''] ?? 'application/octet-stream')
      .setHeader('Content-Length', info.size)
      // Es contenido personal servido con un enlace que caduca: ni cachés
      // intermedias ni buscadores.
      .setHeader('Cache-Control', 'private, no-store')
      .setHeader('X-Content-Type-Options', 'nosniff');

    // Se envía por streaming: un escaneo de 20 MB no pasa por la memoria del
    // proceso, y varias descargas a la vez no se suman.
    createReadStream(ruta).pipe(response);
  }

  @Public()
  @Put('*key')
  async subir(
    @Param('key') partes: string[] | string,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
    @Req() request: Request,
  ): Promise<{ key: string; byteSize: number }> {
    const key = this.claveDe(partes);
    this.comprobarFirma(key, expires, signature, 'put');

    /*
     * El cuerpo se lee del propio flujo: `rawBody` de Nest sólo se rellena para
     * los tipos que el parser entiende, y aquí llegan PDF e imágenes. Se corta
     * en cuanto pasa del tope, así nadie llena la memoria mandando un archivo
     * gigante contra un enlace válido.
     */
    const cuerpo = await leerCuerpo(request, MAX_SUBIDA_BYTES);
    if (cuerpo.byteLength === 0) {
      throw new BadRequestException('La subida llegó vacía');
    }

    const guardado = await this.storage.put(
      key,
      cuerpo,
      request.header('content-type') ?? 'application/octet-stream',
    );
    return { key: guardado.key, byteSize: guardado.byteSize };
  }

  private claveDe(partes: string[] | string): string {
    const key = Array.isArray(partes) ? partes.join('/') : partes;
    if (!isSafeKey(key)) throw new BadRequestException('Clave inválida');
    return key;
  }

  private comprobarFirma(
    key: string,
    expires: string | undefined,
    signature: string | undefined,
    operacion: 'get' | 'put',
  ): void {
    const resultado = verifyPath({
      secret: this.env.JWT_ACCESS_SECRET,
      key,
      expiresAt: expires,
      signature,
      nowSeconds: Math.floor(this.clock.now().getTime() / 1000),
      operation: operacion,
    });

    if (!resultado.valid) {
      // Mismo error para enlace caducado y para firma falsa: distinguirlos diría
      // a quien prueba si acertó la clave y falló la firma.
      throw new NotFoundException('El enlace no es válido o ya caducó');
    }
  }

  private rutaDe(key: string): string {
    const raiz = resolve(this.env.STORAGE_LOCAL_DIR);
    const destino = resolve(join(raiz, key));
    if (!destino.startsWith(raiz + sep)) throw new BadRequestException('Clave inválida');
    return destino;
  }
}

/** Junta el cuerpo de la petición, abortando si supera el tope. */
async function leerCuerpo(request: Request, maxBytes: number): Promise<Buffer> {
  const trozos: Buffer[] = [];
  let total = 0;

  for await (const trozo of request) {
    const buffer = trozo as Buffer;
    total += buffer.byteLength;
    if (total > maxBytes) {
      request.destroy();
      throw new BadRequestException('El archivo excede el tamaño permitido');
    }
    trozos.push(buffer);
  }

  return Buffer.concat(trozos);
}
