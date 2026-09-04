import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Avisos que no salieron y su reintento (§18.1).
 *
 * Estas pruebas existen por un incidente real: un correo de alta estuvo ocho
 * horas sin llegar porque el remitente no estaba verificado, agotó sus tres
 * intentos, y recuperarlo exigió editar la base de datos a mano en producción.
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

function unique(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

let adminToken = '';

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN });
  if (login.status === 429) throw new Error('La API está limitando los accesos (429).');
  expect(login.status).toBe(200);
  adminToken = String(login.body['accessToken']);
});

describe('§18.1 · el panel ve los avisos que no salieron', () => {
  it('devuelve lo atascado y lo pendiente por separado, con su cuenta', async () => {
    // La distinción es la que importa: lo pendiente sale solo con la próxima
    // operación; lo atascado no lo intenta nadie nunca más.
    const vista = await call('/admin/notifications', { token: adminToken });

    expect(vista.status).toBe(200);
    expect(Array.isArray(vista.body['stuck'])).toBe(true);
    expect(Array.isArray(vista.body['pending'])).toBe(true);

    const counts = vista.body['counts'] as Record<string, number>;
    expect(counts['stuck']).toBe((vista.body['stuck'] as unknown[]).length);
    expect(counts['pending']).toBe((vista.body['pending'] as unknown[]).length);
  });

  it('cada fila dice qué evento es, cuántos intentos lleva y por qué falló', async () => {
    const vista = await call('/admin/notifications', { token: adminToken });
    const filas = [
      ...(vista.body['stuck'] as Record<string, unknown>[]),
      ...(vista.body['pending'] as Record<string, unknown>[]),
    ];

    for (const fila of filas) {
      expect(String(fila['id'])).toMatch(/^[0-9a-f-]{36}$/);
      expect(fila['eventType']).toBeTypeOf('string');
      expect(['stuck', 'pending']).toContain(fila['state']);
      expect(fila['attempts']).toBeTypeOf('number');
      // El destinatario puede no constar —hay eventos que lo resuelven al
      // enviarlo—, pero el campo tiene que estar para que el panel no adivine.
      expect(Object.keys(fila)).toContain('recipient');
      expect(Object.keys(fila)).toContain('lastError');
    }
  });
});

describe('§18.1 · reintentar un aviso concreto', () => {
  it('reintentar todo lo atascado responde con la cuenta de lo que salió', async () => {
    const resultado = await call('/admin/notifications/retry', {
      method: 'POST',
      token: adminToken,
    });

    expect(resultado.status).toBe(200);
    expect(resultado.body['intentados']).toBeTypeOf('number');
    expect(resultado.body['enviados']).toBeTypeOf('number');
    // Sin el motivo, «no salió» no dice qué hay que arreglar.
    expect(Object.keys(resultado.body)).toContain('primerError');
    expect(Number(resultado.body['intentados'])).toBe(
      Number(resultado.body['enviados']) + Number(resultado.body['fallidos']),
    );
  });

  it('sin nada atascado, reintentar no es un error: no hay nada que hacer', async () => {
    const resultado = await call('/admin/notifications/retry', {
      method: 'POST',
      token: adminToken,
    });
    expect(resultado.status).toBe(200);
    expect(resultado.body['fallidos']).toBe(0);
  });

  it('un aviso que no existe es 404', async () => {
    const resultado = await call(`/admin/notifications/${randomUUID()}/retry`, {
      method: 'POST',
      token: adminToken,
    });
    expect(resultado.status).toBe(404);
  });

  it('la lista sólo trae lo que no ha salido, así que el botón nunca reenvía nada entregado', async () => {
    /*
     * Es la otra mitad de la regla que cubre `outbox-state.test.ts`: allí se fija
     * que un aviso entregado no es reintentable; aquí, que la pantalla ni
     * siquiera lo ofrece. El 409 queda como defensa para la carrera de dos
     * administradores pulsando a la vez.
     */
    const creado = await call('/admin/users', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: {
        email: `avisos-${unique()}@ejemplo.mx`,
        fullName: 'Cliente de avisos',
        role: 'CLIENT',
      },
    });
    expect(creado.status).toBe(201);

    const vista = await call('/admin/notifications', { token: adminToken });
    const listados = [
      ...(vista.body['stuck'] as Record<string, unknown>[]),
      ...(vista.body['pending'] as Record<string, unknown>[]),
    ];

    for (const fila of listados) {
      expect(fila['publishedAt'], 'un aviso entregado no debe aparecer').toBeNull();
    }
  });
});

describe('§9.1 · sólo la administración ve y reintenta avisos', () => {
  let clienteToken = '';

  beforeAll(async () => {
    const sufijo = unique();
    const email = `avisos-bfla-${sufijo}@ejemplo.mx`;
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

  it('el cliente no ve la lista de avisos', async () => {
    // Los errores de entrega llevan correos de otros deudores dentro.
    const vista = await call('/admin/notifications', { token: clienteToken });
    expect(vista.status).toBe(403);
  });

  it('el cliente no puede reintentar nada', async () => {
    const uno = await call(`/admin/notifications/${randomUUID()}/retry`, {
      method: 'POST',
      token: clienteToken,
    });
    expect(uno.status).toBe(403);

    const todos = await call('/admin/notifications/retry', {
      method: 'POST',
      token: clienteToken,
    });
    expect(todos.status).toBe(403);
  });

  it('sin token, ninguna de las tres responde', async () => {
    for (const [ruta, metodo] of [
      ['/admin/notifications', 'GET'],
      ['/admin/notifications/retry', 'POST'],
      [`/admin/notifications/${randomUUID()}/retry`, 'POST'],
    ] as const) {
      const respuesta = await call(ruta, { method: metodo });
      expect(respuesta.status, `${metodo} ${ruta}`).toBe(401);
    }
  });
});
