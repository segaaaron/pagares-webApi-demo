import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carga el `.env` de desarrollo **antes que nada** (módulo de efecto).
 *
 * Hasta ahora nadie lo cargaba: funcionaba porque `@prisma/client` lo hace por
 * su cuenta al importarse, así que el arranque dependía del orden de los
 * imports. Bastaba con leer una variable antes que Prisma —como hace el
 * decorador de límites de tasa— para que el proceso muriera diciendo que faltan
 * ocho variables que sí están en el archivo.
 *
 * En producción no hay archivo: las variables las pone la plataforma y esto no
 * hace nada. Lo que ya esté en el entorno **manda**: un `.env` olvidado en el
 * servidor no puede pisar la configuración real.
 */
const CANDIDATOS = [
  resolve(process.cwd(), '.env'),
  // Al arrancar desde `apps/api`, el archivo está en la raíz del monorepo.
  resolve(process.cwd(), '../../.env'),
];

for (const archivo of CANDIDATOS) {
  if (!existsSync(archivo)) continue;
  try {
    process.loadEnvFile(archivo);
  } catch {
    // Un `.env` ilegible o mal formado no debe impedir arrancar con las
    // variables del entorno, que es como corre en producción.
  }
  break;
}
