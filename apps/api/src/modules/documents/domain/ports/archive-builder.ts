import type { Writable } from 'node:stream';

export interface ArchiveEntry {
  /** Ruta dentro del zip. Las carpetas se escriben con `/`. */
  name: string;
  /**
   * El contenido, o **cómo obtenerlo**.
   *
   * La forma perezosa existe para el paquete legal: sus escaneos pesan hasta 20
   * MB cada uno (§8.3) y cargarlos todos antes de empezar a comprimir hace que
   * la memoria del proceso crezca con el tamaño del expediente. Produciéndolos
   * de uno en uno, el pico es el del escaneo más grande.
   */
  content: Buffer | string | (() => Promise<Buffer>);
}

/**
 * Puerto de empaquetado (§17.1). El caso de uso decide **qué** entra en el
 * paquete; comprimirlo y por dónde sale es detalle de infraestructura.
 */
export interface ArchiveBuilder {
  /** Escribe el zip en el destino a medida que se genera, sin acumularlo. */
  buildTo(entries: ArchiveEntry[], out: Writable): Promise<void>;
  /** Devuelve el zip completo. Sólo para paquetes pequeños y para pruebas. */
  build(entries: ArchiveEntry[]): Promise<Buffer>;
}

export const ARCHIVE_BUILDER = Symbol('ArchiveBuilder');
