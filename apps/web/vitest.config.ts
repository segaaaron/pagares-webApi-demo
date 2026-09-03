import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
});
