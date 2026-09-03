import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deliveryStatusFor, verifySvixSignature } from './svix-signature.js';

const SECRET = `whsec_${Buffer.from('un-secreto-de-prueba').toString('base64')}`;
const NOW = 1_772_000_000;

function sign(body: string, id = 'msg_1', timestamp = String(NOW)): string {
  const key = Buffer.from(SECRET.slice(6), 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

describe('firma del webhook de entregas', () => {
  const body = '{"type":"email.delivered","data":{"email_id":"abc"}}';

  it('acepta una firma correcta', () => {
    const ok = verifySvixSignature({
      secret: SECRET,
      headers: { id: 'msg_1', timestamp: String(NOW), signature: sign(body) },
      rawBody: body,
      nowSeconds: NOW,
    });
    expect(ok).toBe(true);
  });

  it('rechaza el cuerpo alterado', () => {
    const ok = verifySvixSignature({
      secret: SECRET,
      headers: { id: 'msg_1', timestamp: String(NOW), signature: sign(body) },
      rawBody: body.replace('delivered', 'bounced'),
      nowSeconds: NOW,
    });
    expect(ok).toBe(false);
  });

  it('rechaza una firma vieja aunque sea válida: es un reenvío', () => {
    const old = String(NOW - 3600);
    const ok = verifySvixSignature({
      secret: SECRET,
      headers: { id: 'msg_1', timestamp: old, signature: sign(body, 'msg_1', old) },
      rawBody: body,
      nowSeconds: NOW,
    });
    expect(ok).toBe(false);
  });

  it('acepta cuando una de las varias firmas cuadra', () => {
    const ok = verifySvixSignature({
      secret: SECRET,
      headers: {
        id: 'msg_1',
        timestamp: String(NOW),
        signature: `v1,firma-vieja-que-no-cuadra ${sign(body)}`,
      },
      rawBody: body,
      nowSeconds: NOW,
    });
    expect(ok).toBe(true);
  });

  it('rechaza un timestamp que no es un número', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: { id: 'msg_1', timestamp: 'ayer', signature: sign(body) },
        rawBody: body,
        nowSeconds: NOW,
      }),
    ).toBe(false);
  });

  it('traduce los eventos de entrega y ignora los demás', () => {
    expect(deliveryStatusFor('email.delivered')).toBe('DELIVERED');
    expect(deliveryStatusFor('email.bounced')).toBe('BOUNCED');
    expect(deliveryStatusFor('email.complained')).toBe('FAILED');
    expect(deliveryStatusFor('email.opened')).toBeNull();
  });
});
