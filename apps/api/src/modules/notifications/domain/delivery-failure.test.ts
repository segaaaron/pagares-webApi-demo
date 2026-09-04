import { describe, expect, it } from 'vitest';
import { diagnoseFailure } from './delivery-failure.js';

/**
 * Del error del proveedor a algo accionable (§18.1).
 *
 * El panel enseñaba el texto tal cual llegaba de Resend, en inglés y hablando de
 * dominios y cabeceras. Quien opera la cobranza no tiene por qué traducir eso
 * para saber si el problema lo arregla él, si se arregla solo, o si hay que
 * llamar a alguien.
 */
describe('dominio del remitente sin verificar', () => {
  const error =
    'Resend rechazó el envío: The send.readycvv.com domain is not verified. Please, add and verify your domain on https://resend.com/domains';

  it('lo nombra por lo que es y dice qué hacer', () => {
    const causa = diagnoseFailure(error);
    expect(causa.code).toBe('sender_domain_unverified');
    expect(causa.title).toBe('El dominio del remitente no está verificado');
    expect(causa.action).toContain('Resend');
  });

  it('saca el dominio concreto, que es el dato que hace falta', () => {
    // Sin él, «verifica tu dominio» no dice cuál: aquí conviven el del
    // remitente configurado y el que quedó a medias.
    expect(diagnoseFailure(error).detail).toBe('send.readycvv.com');
  });

  it('se arregla fuera del sistema, así que reintentar antes no sirve', () => {
    expect(diagnoseFailure(error).retryHelps).toBe(false);
  });
});

describe('límite del proveedor', () => {
  const error =
    'Resend rechazó el envío: Too many requests. You can only make 10 requests per second.';

  it('es pasajero y reintentar sí sirve', () => {
    const causa = diagnoseFailure(error);
    expect(causa.code).toBe('provider_rate_limited');
    expect(causa.retryHelps).toBe(true);
  });

  it('no lo confunde con el dominio sin verificar', () => {
    // Los dos llegan como «Resend rechazó el envío» y se arreglan distinto.
    expect(diagnoseFailure(error).title).not.toContain('dominio');
  });
});

describe('no se pudo conectar con el servidor de correo', () => {
  it('reconoce la conexión rechazada y apunta a la configuración', () => {
    const causa = diagnoseFailure('connect ECONNREFUSED 127.0.0.1:1025');
    expect(causa.code).toBe('mailer_unreachable');
    // 127.0.0.1 en producción es el síntoma: quedó apuntando al correo local.
    expect(causa.detail).toBe('127.0.0.1:1025');
    expect(causa.action).toContain('MAIL_DRIVER');
  });

  it('trata igual el nombre que no resuelve y el tiempo agotado', () => {
    expect(diagnoseFailure('getaddrinfo ENOTFOUND smtp.example.com').code).toBe(
      'mailer_unreachable',
    );
    expect(diagnoseFailure('connect ETIMEDOUT 10.0.0.1:587').code).toBe('mailer_unreachable');
  });
});

describe('credenciales del proveedor', () => {
  it('distingue una clave inválida de un rechazo cualquiera', () => {
    // Es el único caso en el que no hay nada que reintentar hasta cambiar una
    // variable de entorno.
    const causa = diagnoseFailure('Resend rechazó el envío: API key is invalid');
    expect(causa.code).toBe('provider_credentials');
    expect(causa.retryHelps).toBe(false);
  });
});

describe('dirección del destinatario', () => {
  it('señala al deudor y no al sistema', () => {
    const causa = diagnoseFailure('Resend rechazó el envío: Invalid `to` field. Not a valid email');
    expect(causa.code).toBe('invalid_recipient');
    expect(causa.action).toContain('deudor');
  });
});

describe('lo que no se reconoce', () => {
  it('no inventa un diagnóstico: lo dice y deja el texto original a la vista', () => {
    const causa = diagnoseFailure('Se rompió algo raro en el proveedor');
    expect(causa.code).toBe('unknown');
    expect(causa.title).toBe('El envío falló');
    // Traducir a ciegas sería peor que no traducir: el texto crudo es la pista.
    expect(causa.retryHelps).toBe(true);
  });

  it('un aviso que aún no se ha intentado no es un fallo', () => {
    const causa = diagnoseFailure(null);
    expect(causa.code).toBe('not_attempted');
    expect(causa.title).toBe('Todavía no se ha intentado');
  });
});
