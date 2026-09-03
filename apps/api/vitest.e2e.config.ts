import { defineConfig } from 'vitest/config';

/**
 * Pruebas de extremo a extremo contra Postgres y MinIO reales.
 * Se ejecutan aparte de las unitarias porque necesitan servicios levantados.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.e2e.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false, // comparten base de datos
  },
});
