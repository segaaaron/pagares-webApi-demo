import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, outboxState, recipientOf, isRetryable } from './outbox-state.js';

/**
 * Estado de un aviso del outbox (§3.3, §18.1).
 *
 * Existe porque un correo que falla tres veces se quedaba muerto en la tabla sin
 * que nadie lo supiera: el panel no tenía forma de verlo ni de reintentarlo, y
 * la única salida era un UPDATE a mano en producción. Para enseñarlo hay que
 * poder nombrarlo, y eso es lo que decide esta función.
 */
/** Instante fijo: el estado no depende del reloj, y la prueba tampoco (§12.1). */
const ENVIADO_EL = new Date('2026-09-04T13:00:00.000Z');

describe('estado de un aviso', () => {
  const nunca = { publishedAt: null, attempts: 0 };

  it('el que ya salió está enviado, aunque haya fallado antes', () => {
    // Un aviso que falló dos veces y salió a la tercera está entregado: el
    // historial de intentos no lo convierte en un problema.
    expect(outboxState({ publishedAt: ENVIADO_EL, attempts: 3 })).toBe('sent');
  });

  it('el recién creado está pendiente', () => {
    expect(outboxState(nunca)).toBe('pending');
  });

  it('sigue pendiente mientras le queden intentos', () => {
    expect(outboxState({ publishedAt: null, attempts: MAX_ATTEMPTS - 1 })).toBe('pending');
  });

  it('al agotar los intentos queda atascado, no pendiente', () => {
    // Ésta es la distinción que faltaba: «pendiente» se reintenta solo con la
    // siguiente operación; «atascado» no lo intenta nadie nunca más.
    expect(outboxState({ publishedAt: null, attempts: MAX_ATTEMPTS })).toBe('stuck');
    expect(outboxState({ publishedAt: null, attempts: MAX_ATTEMPTS + 4 })).toBe('stuck');
  });
});

describe('qué se puede reintentar', () => {
  it('lo atascado, que es justo lo que nadie reintentaría solo', () => {
    expect(isRetryable({ publishedAt: null, attempts: MAX_ATTEMPTS })).toBe(true);
  });

  it('también lo pendiente: reintentar antes de tiempo no hace daño', () => {
    // El despacho es idempotente por diseño; forzarlo sólo adelanta el intento.
    expect(isRetryable({ publishedAt: null, attempts: 1 })).toBe(true);
  });

  it('lo ya enviado no', () => {
    // Reintentar un correo entregado lo manda dos veces al deudor.
    expect(isRetryable({ publishedAt: ENVIADO_EL, attempts: 1 })).toBe(false);
  });
});

describe('a quién iba el aviso', () => {
  it('saca el correo del cuerpo del evento', () => {
    // El panel tiene que decir a quién no le llegó; sin esto, la lista sería una
    // fila de identificadores sin nombre.
    expect(recipientOf({ email: 'juan@ejemplo.mx', userId: 'u1' })).toBe('juan@ejemplo.mx');
  });

  it('devuelve nulo cuando el evento no lleva destinatario', () => {
    // `RefreshReused` avisa por el correo de la cuenta, que se resuelve al
    // enviarlo: aquí no está, y fingir uno sería peor que decir que no se sabe.
    expect(recipientOf({ userId: 'u1', ip: '127.0.0.1' })).toBeNull();
  });

  it('ignora un correo que no es texto', () => {
    expect(recipientOf({ email: 42 })).toBeNull();
    expect(recipientOf(null)).toBeNull();
    expect(recipientOf('cadena suelta')).toBeNull();
  });
});
