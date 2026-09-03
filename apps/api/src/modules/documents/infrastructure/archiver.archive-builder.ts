import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import { PassThrough, type Writable } from 'node:stream';
import type { ArchiveBuilder, ArchiveEntry } from '../domain/ports/archive-builder.js';

/**
 * Zip con `archiver`, escrito **a medida que se genera**.
 *
 * Acumularlo en memoria costaba el tamaño del paquete entero: un expediente con
 * diez escaneos de 20 MB pedía 200 MB de golpe, y cuatro descargas a la vez se
 * llevaban por delante el heap de 320 MB con el que corre la API en el VPS.
 * Escribiendo al destino, el proceso sólo sostiene el archivo que está
 * comprimiendo en ese momento.
 */
/**
 * Zips que se arman a la vez.
 *
 * Cada uno sostiene en memoria el archivo que está comprimiendo —hasta 20 MB en
 * un escaneo del expediente (§8.3)— más el búfer de zlib. Sin tope, ocho
 * descargas simultáneas llevaron el proceso de 176 a 500 MB en medición; con
 * dos, el pico se queda donde el VPS lo aguanta (§6). Quien llega de más espera
 * unos segundos, que para una descarga es la respuesta correcta.
 */
const MAX_CONCURRENT = 2;

@Injectable()
export class ArchiverArchiveBuilder implements ArchiveBuilder {
  private enCurso = 0;
  private readonly cola: (() => void)[] = [];

  async buildTo(entries: ArchiveEntry[], out: Writable): Promise<void> {
    await this.tomarTurno();
    try {
      await this.comprimir(entries, out);
    } finally {
      this.soltarTurno();
    }
  }

  private async tomarTurno(): Promise<void> {
    if (this.enCurso < MAX_CONCURRENT) {
      this.enCurso += 1;
      return;
    }
    await new Promise<void>((resolve) => this.cola.push(resolve));
    this.enCurso += 1;
  }

  private soltarTurno(): void {
    this.enCurso -= 1;
    this.cola.shift()?.();
  }

  private async comprimir(entries: ArchiveEntry[], out: Writable): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const finished = new Promise<void>((resolve, reject) => {
      out.on('error', reject);
      archive.on('error', reject);
      archive.on('end', resolve);
    });

    archive.pipe(out);

    for (const entry of entries) {
      // El contenido se pide justo antes de comprimirlo y se suelta después:
      // dos escaneos grandes nunca coinciden en memoria.
      const content = typeof entry.content === 'function' ? await entry.content() : entry.content;
      archive.append(content, { name: entry.name });
    }

    await archive.finalize();
    await finished;
  }

  async build(entries: ArchiveEntry[]): Promise<Buffer> {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (chunk: Buffer) => chunks.push(chunk));

    await this.buildTo(entries, sink);
    return Buffer.concat(chunks);
  }
}
