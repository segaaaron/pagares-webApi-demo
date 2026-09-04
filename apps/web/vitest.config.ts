import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Las pruebas de componente necesitan DOM; las de lógica no lo estorban.
    environment: 'jsdom',
  },
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.join(import.meta.dirname, 'src'),
      // `server-only` existe para reventar si un módulo del servidor acaba en el
      // bundle del navegador. En una prueba de Node no hay bundle que proteger,
      // y sin este alias el propio import tira la suite.
      'server-only': path.join(import.meta.dirname, 'test/server-only-stub.ts'),
    },
  },
});
