import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Límites de tasa (§25.7).
 *
 * Son independientes del bloqueo por cuenta de §10.2: éste frena bots y ráfagas
 * sin bloquear a nadie, aquél protege una cuenta concreta de la fuerza bruta.
 * Con una sola instancia el contador en memoria basta; si algún día hay varias,
 * debe pasar a un almacén compartido o el límite real se multiplica.
 *
 * **Sólo hay dos throttlers, y son globales.** `@nestjs/throttler` aplica *todos*
 * los que se declaren aquí a *todas* las rutas: dar de alta uno llamado `otp`
 * con 20 por hora no lo reserva para el OTP, lo impone en la API entera. Las
 * rutas sensibles no añaden un throttler propio, sino que **estrechan** el
 * global con `@Throttle`.
 */
/**
 * Cuántos minutos de ráfaga se toleran en la ventana de quince.
 *
 * El sostenido se deriva de la ráfaga en vez de tener su propia variable: son
 * el mismo criterio mirado en dos escalas, y separarlos sólo daba una segunda
 * cifra que mantener coherente a mano. Con la ráfaga de producción (120 por
 * minuto) salen 960 cada quince minutos.
 */
const SUSTAINED_BURST_MINUTES = 8;

export function throttlerConfigFor(
  authPer15m: number,
  burstPerMinute = 120,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      // Ventana corta contra ráfagas.
      { name: 'short', ttl: 60_000, limit: burstPerMinute },
      // Ventana larga contra el goteo sostenido.
      { name: 'long', ttl: 900_000, limit: burstPerMinute * SUSTAINED_BURST_MINUTES },
    ],
  };
}

/*
 * El cupo de credenciales se lee aquí de la variable suelta, y no con `loadEnv`,
 * porque un decorador se evalúa al importar la clase: exigir el entorno completo
 * en ese momento haría que importar este archivo —desde una prueba, por
 * ejemplo— fallara pidiendo ocho variables que no vienen al caso. La validación
 * de verdad la hace `ConfigModule` al arrancar, con el mismo valor por omisión.
 */
const AUTH_LIMIT_DEFAULT = 10;
const authPer15m = Number(process.env['RATE_LIMIT_AUTH_PER_15M']) || AUTH_LIMIT_DEFAULT;

/**
 * Límites estrictos para las rutas donde se adivinan credenciales (§25.7).
 * Estrechan el throttler global `short` para esa ruta: diez accesos por IP cada
 * quince minutos, en vez de la ráfaga general por minuto.
 */
export const AUTH_THROTTLE = {
  short: { ttl: 900_000, limit: authPer15m },
};

/** El OTP cuesta un correo y se puede abusar: veinte por hora y por IP. */
export const OTP_THROTTLE = { short: { ttl: 3_600_000, limit: 20 } };

/** La vista pública no exige sesión: treinta por minuto y por IP. */
export const PUBLIC_THROTTLE = { short: { ttl: 60_000, limit: 30 } };
