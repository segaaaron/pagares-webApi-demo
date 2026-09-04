/**
 * Diagnóstico de un envío que falló (§18.1).
 *
 * El proveedor devuelve su error en inglés y en sus términos —dominios,
 * cabeceras de límite, códigos de socket—. Quien abre el panel necesita otras
 * tres cosas: qué pasó, si lo arregla él, y si reintentar ahora sirve de algo.
 *
 * Es una función pura sobre el texto del error, así que se puede probar sin
 * proveedor, sin red y sin base de datos.
 */
export type FailureCode =
  | 'not_attempted'
  | 'sender_domain_unverified'
  | 'provider_rate_limited'
  | 'mailer_unreachable'
  | 'provider_credentials'
  | 'invalid_recipient'
  | 'unknown';

export interface FailureDiagnosis {
  code: FailureCode;
  /** Qué pasó, en una línea y en castellano. */
  title: string;
  /** El dato concreto: el dominio, el servidor, lo que haga falta mirar. */
  detail: string | null;
  /** Qué hacer. Vacío cuando no hay nada que hacer salvo esperar. */
  action: string;
  /** Si reintentar ahora tiene sentido o hay que arreglar algo antes. */
  retryHelps: boolean;
}

export function diagnoseFailure(lastError: string | null): FailureDiagnosis {
  if (!lastError) {
    return {
      code: 'not_attempted',
      title: 'Todavía no se ha intentado',
      detail: null,
      action: 'Saldrá con la siguiente operación.',
      retryHelps: true,
    };
  }

  const dominio = /\b([\w.-]+\.[a-z]{2,})\s+domain is not verified/i.exec(lastError);
  if (dominio) {
    return {
      code: 'sender_domain_unverified',
      title: 'El dominio del remitente no está verificado',
      detail: dominio[1] ?? null,
      action:
        'Verifica el dominio en Resend (resend.com/domains) y comprueba que MAIL_FROM use ese mismo dominio. Después reintenta.',
      // Reintentar antes de verificarlo vuelve a fallar y gasta los intentos.
      retryHelps: false,
    };
  }

  if (/too many requests|rate limit/i.test(lastError)) {
    return {
      code: 'provider_rate_limited',
      title: 'El proveedor frenó el envío por exceso de peticiones',
      detail: null,
      action: 'Es pasajero: reintenta en un minuto.',
      retryHelps: true,
    };
  }

  const socket = /(ECONNREFUSED|ENOTFOUND|ETIMEDOUT)\s+([\w.:-]+)/i.exec(lastError);
  if (socket) {
    return {
      code: 'mailer_unreachable',
      title: 'No se pudo conectar con el servidor de correo',
      detail: socket[2] ?? null,
      action:
        'Revisa MAIL_DRIVER y los datos del servidor de correo. Una dirección local (127.0.0.1) en producción significa que quedó apuntando al correo de desarrollo.',
      retryHelps: false,
    };
  }

  if (/api key|unauthorized|invalid_api_key|forbidden/i.test(lastError)) {
    return {
      code: 'provider_credentials',
      title: 'El proveedor rechazó las credenciales',
      detail: null,
      action: 'Revisa RESEND_API_KEY. Reintentar no sirve hasta cambiarla.',
      retryHelps: false,
    };
  }

  if (/invalid .*(`?to`?|recipient|email)/i.test(lastError)) {
    return {
      code: 'invalid_recipient',
      title: 'La dirección del destinatario no es válida',
      detail: null,
      action: 'Corrige el correo del deudor en su ficha y reintenta.',
      retryHelps: false,
    };
  }

  return {
    code: 'unknown',
    title: 'El envío falló',
    detail: null,
    // Traducir a ciegas sería peor que no traducir: el texto original queda a la
    // vista y es la pista para quien lo investigue.
    action: 'Revisa el error del proveedor. Si fue algo pasajero, reintenta.',
    retryHelps: true,
  };
}
