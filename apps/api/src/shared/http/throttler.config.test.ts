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

const configurados = (authPer15m: number, burst?: number): Configurados['throttlers'] =>
  (throttlerConfigFor(authPer15m, burst) as unknown as Configurados).throttlers;

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

  it('con la ráfaga de producción, el goteo son 960 cada quince minutos', () => {
    const config = configurados(10);
    expect(config[0]?.limit).toBe(120);
    expect(config[1]?.limit).toBe(960);
  });

  it('el goteo se deriva de la ráfaga: un solo mando, no dos cifras que cuadrar', () => {
    // Subir la ráfaga para la prueba de carga de §22.1 sube también el
    // sostenido. Con dos variables sueltas había que acordarse de las dos, y
    // olvidar la segunda hacía medir el throttler en vez de la API.
    const config = configurados(10, 500);
    expect(config[1]?.limit).toBe(500 * 8);
  });

  it('las dos ventanas conservan su duración aunque cambie el cupo', () => {
    const config = configurados(10, 500);
    expect(config[0]?.ttl).toBe(60_000);
    expect(config[1]?.ttl).toBe(900_000);
  });
});
