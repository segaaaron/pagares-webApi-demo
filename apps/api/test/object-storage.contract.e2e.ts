import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../src/config/env.schema.js';
import type { ObjectStorage } from '../src/modules/media/domain/ports/object-storage.js';
import { LocalObjectStorage } from '../src/modules/media/infrastructure/local-object-storage.js';
import { S3ObjectStorage } from '../src/modules/media/infrastructure/s3-object-storage.js';

/**
 * Batería de contrato del puerto `ObjectStorage` (§7, regla L; §25.9).
 *
 * Las dos implementaciones —volumen local (ADR 0009) y S3/MinIO— pasan
 * exactamente las mismas pruebas. Es la única forma de que cambiar
 * `STORAGE_DRIVER` en producción no descubra una diferencia de comportamiento
 * con una firma dentro.
 *
 * La de S3 necesita MinIO en `STORAGE_ENDPOINT`. Si no responde, ese bloque se
 * salta con aviso en vez de fallar: no todo el mundo lo levanta para tocar el
 * dominio.
 */
const ENDPOINT = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000';
const BUCKET = process.env.STORAGE_BUCKET ?? 'pagares-media';
const ACCESS_KEY = process.env.STORAGE_ACCESS_KEY ?? 'pagares';
const SECRET_KEY = process.env.STORAGE_SECRET_KEY ?? 'pagares_local';

/** Sólo los campos que los adaptadores leen; el resto del `Env` no les importa. */
function envDe(overrides: Partial<Env>): Env {
  return {
    STORAGE_SIGNED_URL_TTL_SECONDS: 900,
    STORAGE_REGION: 'auto',
    STORAGE_FORCE_PATH_STYLE: true,
    JWT_ACCESS_SECRET: 'secreto-de-pruebas-con-longitud-suficiente',
    API_PUBLIC_URL: 'http://localhost:3001',
    ...overrides,
  } as Env;
}

const reloj = { now: () => new Date('2026-09-04T12:00:00.000Z') };

/**
 * El adaptador local firma con el secreto de los tokens y guarda en el volumen
 * de la API: sin las mismas variables que ella, la URL firmada no se puede
 * comprobar de verdad. Se pide el entorno cargado (`pnpm test:e2e`) y la API
 * arriba; sin eso la batería se salta con aviso en vez de fallar por el motivo
 * equivocado.
 */
async function entornoLocalListo(): Promise<boolean> {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.STORAGE_LOCAL_DIR) return false;
  try {
    const salud = await fetch(`${process.env.API_PUBLIC_URL}/api/v1/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return salud.ok;
  } catch {
    return false;
  }
}

async function minioResponde(): Promise<boolean> {
  try {
    const respuesta = await fetch(`${ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(1500),
    });
    return respuesta.ok;
  } catch {
    return false;
  }
}

/**
 * La batería. Todo lo que el puerto promete y ninguna implementación puede
 * interpretar a su manera.
 */
function bateriaDeContrato(
  nombre: string,
  crear: () => Promise<ObjectStorage>,
  disponible: () => Promise<boolean> = async () => true,
): void {
  describe(`contrato de ObjectStorage · ${nombre}`, () => {
    let almacen: ObjectStorage;
    let hayServicio = true;
    const claves: string[] = [];

    /**
     * Cada prueba se salta si el servicio no está: comprobarlo aquí y no al
     * declarar la suite evita un `await` en el nivel superior del módulo, que
     * el tsconfig de la API (CommonJS) no admite.
     */
    function prueba(titulo: string, cuerpo: () => Promise<void>): void {
      it(titulo, async (ctx) => {
        if (!hayServicio) ctx.skip();
        await cuerpo();
      });
    }

    /** Clave de un solo uso; se recogen todas para borrarlas al final. */
    function clave(sufijo = 'bin'): string {
      const key = `pruebas/contrato/${randomUUID()}.${sufijo}`;
      claves.push(key);
      return key;
    }

    beforeAll(async () => {
      hayServicio = await disponible();
      if (!hayServicio) {
        // Saltarlo en silencio dejaría media batería sin correr sin que nadie
        // lo note.
        console.warn(`[contrato] ${nombre}: el servicio no responde; se salta.`);
        return;
      }
      almacen = await crear();
    });

    afterAll(async () => {
      if (!hayServicio) return;
      for (const key of claves) await almacen.remove(key).catch(() => undefined);
    });

    prueba('devuelve el tamaño y el sha256 de lo que guardó', async () => {
      const cuerpo = Buffer.from('firma del deudor');
      const guardado = await almacen.put(clave(), cuerpo, 'application/octet-stream');

      expect(guardado.byteSize).toBe(cuerpo.byteLength);
      // El hash es la evidencia (§24.1): si cada adaptador lo calculara a su
      // manera, el certificado de una firma no valdría nada.
      expect(guardado.sha256).toBe(createHash('sha256').update(cuerpo).digest('hex'));
    });

    prueba('devuelve exactamente los bytes que se guardaron', async () => {
      const key = clave('png');
      // Bytes binarios de verdad, con ceros dentro: en texto, una conversión a
      // string por el camino no se notaría.
      const cuerpo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x00, 0x1a]);
      await almacen.put(key, cuerpo, 'image/png');

      expect(Buffer.compare(await almacen.get(key), cuerpo)).toBe(0);
    });

    prueba('guarda bajo carpetas sin aplanar la clave', async () => {
      const key = `pruebas/contrato/${randomUUID()}/anidado/objeto.bin`;
      claves.push(key);
      const guardado = await almacen.put(key, Buffer.from('a'), 'text/plain');
      expect(guardado.key).toBe(key);
      expect((await almacen.get(key)).toString()).toBe('a');
    });

    prueba('sobrescribir la misma clave deja el contenido nuevo', async () => {
      const key = clave();
      await almacen.put(key, Buffer.from('viejo'), 'text/plain');
      await almacen.put(key, Buffer.from('nuevo'), 'text/plain');
      expect((await almacen.get(key)).toString()).toBe('nuevo');
    });

    prueba('borrar deja el objeto inaccesible', async () => {
      const key = clave();
      await almacen.put(key, Buffer.from('temporal'), 'text/plain');
      await almacen.remove(key);
      await expect(almacen.get(key)).rejects.toThrow();
    });

    prueba('borrar lo que ya no está no es un error', async () => {
      // El pipeline de firma compensa borrando lo que subió (§8.4); si el
      // segundo borrado lanzara, taparía el error original.
      await expect(almacen.remove(clave())).resolves.toBeUndefined();
    });

    prueba('la URL firmada es absoluta y caduca', async () => {
      const key = clave();
      await almacen.put(key, Buffer.from('privado'), 'text/plain');

      const url = await almacen.signedUrl(key, 120);
      expect(url).toMatch(/^https?:\/\//);
      // Sin caducidad en la URL, copiar la dirección sería dar acceso perpetuo.
      const parametros = new URL(url).searchParams;
      const caduca =
        parametros.get('expires') ?? parametros.get('X-Amz-Expires') ?? '';
      expect(caduca).not.toBe('');
    });

    prueba('la URL firmada sirve el objeto tal cual', async () => {
      const key = clave();
      const cuerpo = Buffer.from('contenido servido por la URL firmada');
      await almacen.put(key, cuerpo, 'text/plain');

      const respuesta = await fetch(await almacen.signedUrl(key, 120));
      expect(respuesta.status).toBe(200);
      expect(Buffer.from(await respuesta.arrayBuffer()).toString()).toBe(cuerpo.toString());
    });

    prueba('el archivo se puede incrustar desde otro origen', async () => {
      /*
       * Regresión de un fallo real: la firma del pagaré se veía como imagen rota
       * en el panel. El archivo estaba guardado y la URL respondía 200, pero el
       * panel vive en otro subdominio que la API y la política por omisión
       * —`Cross-Origin-Resource-Policy: same-origin`— hace que el navegador
       * descargue la respuesta y la descarte, sin un solo error visible.
       *
       * En esta ruta la autorización es la firma del enlace y no el origen de
       * quien lo pide, igual que en una URL prefirmada de S3.
       */
      const key = clave('png');
      await almacen.put(key, Buffer.from('imagen'), 'image/png');

      const respuesta = await fetch(await almacen.signedUrl(key, 120));
      const politica = respuesta.headers.get('cross-origin-resource-policy');
      // MinIO no la manda y no le hace falta: sirve desde su propio origen.
      if (politica !== null) expect(politica).toBe('cross-origin');
    });

    prueba('la subida directa devuelve la clave y el plazo que se pidió', async () => {
      const key = clave();
      const firmado = await almacen.presignPut({
        key,
        contentType: 'application/pdf',
        maxBytes: 5_000_000,
        ttlSeconds: 300,
      });

      expect(firmado.key).toBe(key);
      expect(firmado.expiresIn).toBe(300);
      expect(firmado.url).toMatch(/^https?:\/\//);
    });
  });
}

// ── Volumen local ────────────────────────────────────────────────────────────
// Escribe en el directorio que sirve la API para que la URL firmada se pueda
// pedir de verdad; las claves van bajo `pruebas/` y se borran al terminar.
bateriaDeContrato(
  'volumen local',
  async () =>
    Promise.resolve(
      new LocalObjectStorage(
        envDe({
          STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR as string,
          JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET as string,
          API_PUBLIC_URL: process.env.API_PUBLIC_URL as string,
        }),
        // El reloj inyectado es lo que hace comprobable la caducidad (§12.1).
        { now: () => new Date() },
      ),
    ),
  entornoLocalListo,
);

bateriaDeContrato(
  'S3 · MinIO',
  async () => {
    const client = new S3Client({
      endpoint: ENDPOINT,
      region: 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    });
    // El bucket puede no existir en una máquina recién montada.
    await client.send(new CreateBucketCommand({ Bucket: BUCKET })).catch(() => undefined);

    return new S3ObjectStorage(
      envDe({
        STORAGE_ENDPOINT: ENDPOINT,
        STORAGE_BUCKET: BUCKET,
        STORAGE_ACCESS_KEY: ACCESS_KEY,
        STORAGE_SECRET_KEY: SECRET_KEY,
      }),
    );
  },
  minioResponde,
);

describe('almacenamiento local · lo que sólo aplica al disco', () => {
  let directorio = '';

  beforeAll(async () => {
    directorio = await mkdtemp(join(tmpdir(), 'pagares-storage-'));
  });

  afterAll(async () => {
    await rm(directorio, { recursive: true, force: true });
  });

  it('una clave que sale de la raíz no se escribe', async () => {
    // Segunda defensa de §8.4: aunque el formato pasara, la ruta resuelta tiene
    // que seguir dentro del volumen.
    const almacen = new LocalObjectStorage(envDe({ STORAGE_LOCAL_DIR: directorio }), reloj);
    await expect(almacen.put('../fuera.bin', Buffer.from('x'), 'text/plain')).rejects.toThrow();
  });

  it('la firma caduca en el plazo pedido, contado con el reloj inyectado', async () => {
    const almacen = new LocalObjectStorage(envDe({ STORAGE_LOCAL_DIR: directorio }), reloj);
    const url = new URL(await almacen.signedUrl('media/objeto.png', 60));
    const esperado = Math.floor(reloj.now().getTime() / 1000) + 60;
    expect(url.searchParams.get('expires')).toBe(String(esperado));
  });
});
