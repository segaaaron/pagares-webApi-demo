import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env.schema.js';

export const ENV = Symbol('Env');

/**
 * El entorno se valida una vez al arrancar y se inyecta ya tipado.
 * Nadie lee `process.env` suelto: así una variable faltante mata el proceso al
 * inicio, con un mensaje claro, en vez de fallar a media operación (§9.1, API8).
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
