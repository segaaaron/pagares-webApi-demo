import { createHmac, timingSafeEqual } from 'node:crypto';

/** Ventana de tolerancia del reloj, en segundos. Svix usa cinco minutos. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface SvixHeaders {
  id: string;
  timestamp: string;
  /** Puede traer varias firmas separadas por espacio: `v1,<b64> v1,<b64>`. */
  signature: string;
}

/**
 * Verificación de la firma de un webhook de Resend (protocolo Svix).
 *
 * Es puro y se prueba solo: la firma se calcula sobre `id.timestamp.cuerpo`
 * **crudo**, así que reserializar el JSON antes de comprobarla la invalida —una
 * coma o un orden de claves distinto y el HMAC ya no cuadra.
 *
 * Sin esta comprobación, cualquiera que conozca la URL puede marcar como
 * entregado un correo que nunca salió, y el rebote dejaría de verse (§22.5).
 */
export function verifySvixSignature(input: {
  secret: string;
  headers: SvixHeaders;
  rawBody: string;
  nowSeconds: number;
}): boolean {
  const timestamp = Number(input.headers.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(input.nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

  // El secreto llega como `whsec_<base64>`; lo que se usa es el base64.
  const secret = input.secret.startsWith('whsec_') ? input.secret.slice(6) : input.secret;
  const key = Buffer.from(secret, 'base64');

  const expected = createHmac('sha256', key)
    .update(`${input.headers.id}.${input.headers.timestamp}.${input.rawBody}`)
    .digest('base64');

  for (const candidate of input.headers.signature.split(' ')) {
    const [version, value] = candidate.split(',');
    if (version !== 'v1' || !value) continue;

    const a = Buffer.from(value);
    const b = Buffer.from(expected);
    // Comparación de tiempo constante: comparar con `===` filtra el prefijo
    // correcto por el tiempo que tarda en fallar.
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }

  return false;
}

/** Estados de entrega que reporta Resend, traducidos al enum del dominio. */
export function deliveryStatusFor(
  eventType: string,
): 'SENT' | 'DELIVERED' | 'BOUNCED' | 'FAILED' | null {
  switch (eventType) {
    case 'email.sent':
      return 'SENT';
    case 'email.delivered':
      return 'DELIVERED';
    case 'email.bounced':
      return 'BOUNCED';
    case 'email.complained':
    case 'email.delivery_delayed':
      return 'FAILED';
    default:
      // Un evento que no habla de entrega (`email.opened`, `email.clicked`) no
      // es un error: simplemente no cambia el estado.
      return null;
  }
}
