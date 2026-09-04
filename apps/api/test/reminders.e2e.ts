import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Los avisos del día, en una pasada (§13.1, §18).
 *
 * Antes había que entrar pagaré por pagaré: con treinta vencimientos, treinta
 * viajes. La regla que estas pruebas protegen es la que hace que el botón se
 * pueda pulsar sin miedo — correrlo dos veces el mismo día no manda dos correos
 * al mismo deudor.
 *
 * Requiere la API levantada y sembrada (`pnpm db:seed`).
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
const ADMIN = { email: 'admin@pagares.local', password: 'Demo-Pagares-2026' };

interface Call {
  method?: string;
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
}

async function call(
  path: string,
  init: Call = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;

  const response = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await response.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
  }
  return { status: response.status, body };
}

let adminToken = '';

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN });
  if (login.status === 429) throw new Error('La API está limitando los accesos (429).');
  expect(login.status).toBe(200);
  adminToken = String(login.body['accessToken']);
});

describe('§13.1 · qué avisos tocan hoy', () => {
  it('la vista previa no manda nada: es una pregunta', async () => {
    const primera = await call('/admin/reminders/today', { token: adminToken });
    expect(primera.status).toBe(200);
    expect(primera.body['date']).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Pedirla dos veces devuelve lo mismo: si escribiera algo, la segunda
    // llamada vería los avisos como ya enviados.
    const segunda = await call('/admin/reminders/today', { token: adminToken });
    expect((segunda.body['pending'] as unknown[]).length).toBe(
      (primera.body['pending'] as unknown[]).length,
    );
  });

  it('cada candidato dice a quién, con qué plantilla y en qué tramo', async () => {
    const vista = await call('/admin/reminders/today', { token: adminToken });
    const candidatos = [
      ...(vista.body['pending'] as Record<string, unknown>[]),
      ...(vista.body['alreadySent'] as Record<string, unknown>[]),
    ];

    for (const candidato of candidatos) {
      expect(String(candidato['folio'])).toMatch(/^PAG-\d{4}-\d{6}$/);
      // Sin el destinatario a la vista, nadie pulsa un botón que manda correos.
      expect(String(candidato['to'])).toContain('@');
      expect(candidato['templateId']).toBeTypeOf('string');
      expect(candidato['offsetDays']).toBeTypeOf('number');
      expect(candidato['debtorName']).toBeTypeOf('string');
    }
  });
});

describe('§13.1 · mandarlos todos, dos veces', () => {
  it('la primera pasada envía y la segunda no duplica', async () => {
    const primera = await call('/admin/reminders/today', {
      method: 'POST',
      token: adminToken,
    });
    expect(primera.status).toBe(200);
    expect(Number(primera.body['intentados'])).toBe(
      Number(primera.body['enviados']) +
        Number(primera.body['yaEstaban']) +
        Number(primera.body['fallidos']),
    );

    const segunda = await call('/admin/reminders/today', {
      method: 'POST',
      token: adminToken,
    });
    expect(segunda.status).toBe(200);

    /*
     * Ésta es la regla: lo que salió en la primera pasada cuenta como «ya
     * estaba» en la segunda, y no se envía otra vez. La garantiza la clave
     * única (pagaré, regla, día) de ReminderLog, no este bucle.
     */
    expect(Number(segunda.body['enviados'])).toBe(0);
    expect(Number(segunda.body['yaEstaban'])).toBe(Number(segunda.body['intentados']));
  });

  it('después de mandarlos, la vista previa los da por enviados', async () => {
    const vista = await call('/admin/reminders/today', { token: adminToken });
    expect((vista.body['pending'] as unknown[]).length).toBe(0);
    // Y siguen listados, no desaparecen: saber que ya salieron es parte de la
    // respuesta.
    expect(Array.isArray(vista.body['alreadySent'])).toBe(true);
  });
});

describe('§9.1 · sólo la administración dispara los avisos', () => {
  let clienteToken = '';

  beforeAll(async () => {
    const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const email = `recordatorios-${sufijo}@ejemplo.mx`;
    const creado = await call('/admin/users', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: { email, fullName: 'Cliente sin permiso', role: 'CLIENT' },
    });
    const reto = await call('/auth/login', {
      method: 'POST',
      body: { email, password: String(creado.body['temporaryPassword']) },
    });
    const sesion = await call('/auth/password/change-initial', {
      method: 'POST',
      body: {
        changeToken: String(reto.body['changeToken']),
        newPassword: `Avisos-${sufijo}-2026!`,
      },
    });
    clienteToken = String(sesion.body['accessToken']);
  });

  it('el cliente no ve a quién se le va a avisar', async () => {
    // La vista previa lleva nombres y correos de otros deudores.
    const vista = await call('/admin/reminders/today', { token: clienteToken });
    expect(vista.status).toBe(403);
  });

  it('el cliente no puede lanzar los envíos', async () => {
    const envio = await call('/admin/reminders/today', {
      method: 'POST',
      token: clienteToken,
    });
    expect(envio.status).toBe(403);
  });

  it('sin token, ninguna de las dos responde', async () => {
    expect((await call('/admin/reminders/today')).status).toBe(401);
    expect((await call('/admin/reminders/today', { method: 'POST' })).status).toBe(401);
  });
});
