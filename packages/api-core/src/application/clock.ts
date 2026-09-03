/**
 * Reloj inyectable (§12.1). Ninguna regla del dominio llama a `new Date()`:
 * así las pruebas fijan instantes en los bordes (23:30 y 00:30 locales).
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('Clock');

export class SystemClock implements Clock {
  now(): Date {
    // Único lugar del repositorio donde se lee el reloj del sistema: aquí se
    // encapsula, para que el resto del código dependa del puerto y sea testeable.
    // eslint-disable-next-line no-restricted-syntax
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}
  now(): Date {
    return new Date(this.instant);
  }
}
