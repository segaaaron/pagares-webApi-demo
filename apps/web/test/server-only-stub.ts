/**
 * Sustituto de `server-only` para las pruebas.
 *
 * El paquete real lanza al importarse fuera de un entorno de servidor, que es
 * justo lo que queremos en producción y justo lo que estorba en una prueba de
 * Node. El alias vive en `vitest.config.ts`.
 */
export {};
