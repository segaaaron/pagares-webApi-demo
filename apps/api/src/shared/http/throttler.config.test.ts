import { describe, expect, it } from 'vitest';
import {
  AUTH_THROTTLE,
  OTP_THROTTLE,
  PUBLIC_THROTTLE,
  throttlerConfigFor,
} from './throttler.config.js';

/** `ThrottlerModuleOptions` admite dos formas; la nuestra es siempre la de objeto. */
interface Configurados {
  throttlers: { name: string; ttl: number; limit: number }[];
}

const configurados = (
  authPer15m: number,
  burst?: number,
  sostenido?: number,
): Configurados['throttlers'] =>
  (throttlerConfigFor(authPer15m, burst, sostenido) as unknown as Configurados).throttlers;

/**
 * Estas pruebas fijan una lección que costó cara: `@nestjs/throttler` aplica
 * **todos** los throttlers declarados a **todas** las rutas. Declarar uno
 * llamado `otp` con veinte por hora no lo reserva para el OTP —deja la API
 * entera en veinte peticiones por hora y por ruta—, y el síntoma aparece lejos
 * del sitio: pruebas que pasan sueltas y fallan seguidas.
 */
describe('límites de tasa (§25.7)', () => {
  it('sólo declara los dos throttlers globales', () => {
    expect(configurados(10).map((t) => t.name)).toEqual(['short', 'long']);
  });

  it('las rutas sensibles estrechan el global, no añaden uno nuevo', () => {
    for (const override of [AUTH_THROTTLE, OTP_THROTTLE, PUBLIC_THROTTLE]) {
      expect(Object.keys(override)).toEqual(['short']);
    }
  });

  it('las credenciales son más estrictas que la ráfaga general', () => {
    expect(AUTH_THROTTLE.short.limit).toBeLessThanOrEqual(
      Number(process.env['RATE_LIMIT_AUTH_PER_15M']) || 10,
    );
    // Ventana de quince minutos, no de uno: la fuerza bruta es paciente.
    expect(AUTH_THROTTLE.short.ttl).toBe(900_000);
  });

  it('la ráfaga y el goteo son configurables, con los valores de producción por omisión', () => {
    const porOmision = configurados(10);
    expect(porOmision[0]?.limit).toBe(120);
    expect(porOmision[1]?.limit).toBe(1_000);

    const config = configurados(10, 500, 50_000);
    expect(config[0]?.limit).toBe(500);
    // El goteo se sube para la prueba de carga de §22.1: cien usuarios durante
    // media hora salen todos de una IP y con mil cada quince minutos se mide el
    // throttler, no la API.
    expect(config[1]?.limit).toBe(50_000);
  });

  it('las dos ventanas conservan su duración aunque cambien los cupos', () => {
    const config = configurados(10, 500, 50_000);
    expect(config[0]?.ttl).toBe(60_000);
    expect(config[1]?.ttl).toBe(900_000);
  });
});
