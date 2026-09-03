import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Empaqueta sólo lo que el servidor necesita: la imagen final baja de ~1 GB a
  // ~150 MB y el proceso arranca con bastante menos memoria residente.
  output: 'standalone',
  // En un monorepo hay que decirle dónde empieza el workspace o deja fuera los
  // paquetes internos.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  // Las cabeceras de seguridad de §9.2 (CSP con nonce, frame-ancestors, HSTS)
  // se aplican en middleware.ts durante F10.
};

export default config;
