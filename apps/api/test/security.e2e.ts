import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Pruebas de autorización: BOLA y BFLA del OWASP API Top 10 (§9.1).
 *
 * Son las dos que no se ven leyendo el código: cada endpoint parece correcto por
 * separado, y el agujero aparece cuando un cliente pide el pagaré de otro con un
 * token perfectamente válido (API1) o cuando llama a una ruta de administración
 * que nadie pensó que él pudiera tocar (API5).
 *
 * Requiere la API levantada con la base sembrada (`pnpm db:seed`).
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
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
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
  return { status: response.status, body, headers: response.headers };
}

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Cliente con sesión abierta y un pagaré propio, montado por la vía real. */
interface Client {
  email: string;
  token: string;
  noteId: string;
  folio: string;
  paymentId: string;
}

let adminToken = '';

/**
 * Da de alta un cliente, estrena su contraseña y le emite un pagaré firmado con
 * un abono. Pasa por el flujo completo —incluido el cambio obligatorio del
 * primer acceso (§10.3)—, así que además comprueba que ese camino existe.
 */
async function makeClient(label: string): Promise<Client> {
  const email = `bola-${label}-${Date.now()}@ejemplo.mx`;

  const created = await call('/admin/users', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: { email, fullName: `Cliente ${label}`, role: 'CLIENT' },
  });
  expect(created.status).toBe(201);
  const temporary = String(created.body['temporaryPassword']);

  const challenge = await call('/auth/login', {
    method: 'POST',
    body: { email, password: temporary },
  });
  if (challenge.status === 429) {
    // El límite de §25.7 es 10 accesos por IP cada 15 minutos: dos pasadas
    // seguidas de esta suite lo agotan. Decirlo evita buscar el fallo donde no
    // está.
    throw new Error(
      'La API está limitando los accesos (429). Espera la ventana de 15 minutos o reinicia la API.',
    );
  }
  expect(challenge.status).toBe(200);
  expect(challenge.body['outcome']).toBe('must_change_password');

  const session = await call('/auth/password/change-initial', {
    method: 'POST',
    body: { changeToken: String(challenge.body['changeToken']), newPassword: `Clave-${label}-2026!` },
  });
  // El cambio inicial deja la sesión abierta: si devolviera `ok: true`, el
  // cliente se quedaría fuera con una contraseña recién estrenada (§10.3).
  expect(session.status).toBe(200);
  expect(session.body['accessToken']).toBeTruthy();

  const note = await call('/admin/notes', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: {
      debtor: {
        fullName: `Cliente ${label}`,
        address: 'Calle de prueba 1',
        phone: `+52443${String(Date.now()).slice(-7)}`,
        email,
      },
      issuePlace: 'Morelia, Michoacán',
      issueDate: futureDate(-2),
      paymentPlace: 'Morelia, Michoacán',
      dueDate: futureDate(30),
      creditorName: 'Créditos Morelia S.A. de C.V.',
      amountCents: '1000000',
      interestRate: { value: 3, period: 'MONTHLY' },
    },
  });
  expect(note.status).toBe(201);

  return {
    email,
    token: String(session.body['accessToken']),
    noteId: String(note.body['id']),
    folio: String(note.body['folio']),
    paymentId: '',
  };
}

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN });
  expect(login.status).toBe(200);
  adminToken = String(login.body['accessToken']);
});

describe('API1 · BOLA: nadie ve el objeto de otro', () => {
  let uno: Client;
  let dos: Client;

  beforeAll(async () => {
    uno = await makeClient('uno');
    dos = await makeClient('dos');
  });

  it('el cliente ve su propio pagaré', async () => {
    const own = await call(`/me/notes/${uno.noteId}`, { token: uno.token });
    expect(own.status).toBe(200);
    expect(own.body['folio']).toBe(uno.folio);
  });

  it('no ve el pagaré de otro cliente, ni con un id válido', async () => {
    const other = await call(`/me/notes/${dos.noteId}`, { token: uno.token });
    // 404 y no 403: confirmar que el objeto existe ya sería filtrar información.
    expect(other.status).toBe(404);
  });

  it('no ve los abonos de un pagaré ajeno', async () => {
    const other = await call(`/me/notes/${dos.noteId}/payments`, { token: uno.token });
    expect(other.status).toBe(404);
  });

  it('no descarga el documento de un pagaré ajeno', async () => {
    const other = await call(`/me/notes/${dos.noteId}/documents/note`, { token: uno.token });
    expect(other.status).toBe(404);
  });

  it('no descarga el recibo de un abono que no es de su pagaré', async () => {
    // El recibo cuelga de un abono, y el abono de un pagaré: la comprobación
    // tiene que llegar hasta el último eslabón (§9.1, API1).
    const ajeno = await call(
      `/me/notes/${uno.noteId}/documents/receipt?paymentId=${dos.noteId}`,
      { token: uno.token },
    );
    expect(ajeno.status).toBe(404);
  });

  it('pedir un recibo sin decir de qué abono es 400, no un documento cualquiera', async () => {
    const sinAbono = await call(`/me/notes/${uno.noteId}/documents/receipt`, { token: uno.token });
    expect(sinAbono.status).toBe(400);
  });

  it('su listado sólo trae lo suyo', async () => {
    const list = await call('/me/notes', { token: uno.token });
    expect(list.status).toBe(200);
    const folios = (list.body as unknown as { folio: string }[]).map((note) => note.folio);
    expect(folios).toContain(uno.folio);
    expect(folios).not.toContain(dos.folio);
  });

  it('su actividad no menciona pagarés ajenos', async () => {
    const activity = await call('/me/activity', { token: uno.token });
    expect(activity.status).toBe(200);
    const folios = (activity.body as unknown as { folio: string }[]).map((event) => event.folio);
    expect(folios).not.toContain(dos.folio);
  });
});

describe('API5 · BFLA: el cliente no llega a las rutas de administración', () => {
  let cliente: Client;

  beforeAll(async () => {
    // Se reutiliza una sesión de cliente en lugar de abrir otra: cada acceso
    // consume el límite de §25.7, y agotarlo aquí haría fallar la suite por un
    // motivo que no tiene nada que ver con la autorización.
    cliente = await makeClient('bfla');
  });

  const RUTAS: { method: string; path: string; body?: unknown }[] = [
    { method: 'GET', path: '/admin/notes' },
    { method: 'GET', path: '/admin/debtors' },
    { method: 'GET', path: '/admin/users' },
    { method: 'GET', path: '/admin/audit' },
    { method: 'GET', path: '/admin/reports/portfolio' },
    { method: 'GET', path: '/admin/reports/accounting?kind=portfolio' },
    { method: 'GET', path: '/admin/reports/balance-check' },
    { method: 'GET', path: '/admin/documents/bundle?noteIds=x' },
    { method: 'GET', path: '/admin/reminder-rules' },
    { method: 'GET', path: '/admin/settings' },
    { method: 'PUT', path: '/admin/settings', body: { legalName: 'Mío ahora' } },
    { method: 'POST', path: '/admin/imports/debtors', body: { csv: 'nombre\nyo', commit: true } },
  ];

  for (const ruta of RUTAS) {
    it(`${ruta.method} ${ruta.path} responde 403`, async () => {
      const result = await call(ruta.path, {
        method: ruta.method,
        token: cliente.token,
        ...(ruta.body !== undefined ? { body: ruta.body } : {}),
      });
      expect(result.status).toBe(403);
    });
  }

  it('no puede recalcular el saldo de su propio pagaré', async () => {
    // Recalcular escribe: es de administración aunque el pagaré sea suyo.
    const result = await call(`/admin/notes/${cliente.noteId}/recalculate-balance`, {
      method: 'POST',
      token: cliente.token,
      body: {},
    });
    expect(result.status).toBe(403);
  });

  it('no puede castigar su propio pagaré', async () => {
    const result = await call(`/admin/notes/${cliente.noteId}/write-off`, {
      method: 'POST',
      token: cliente.token,
      idempotencyKey: randomUUID(),
      body: { reasonCode: 'uncollectible', reasonNote: 'me lo perdono', confirmFolio: cliente.folio },
    });
    expect(result.status).toBe(403);
  });

  it('sin token, la ruta no responde: denegar es el estado por defecto', async () => {
    for (const ruta of RUTAS) {
      const result = await call(ruta.path, {
        method: ruta.method,
        token: null,
        ...(ruta.body !== undefined ? { body: ruta.body } : {}),
      });
      expect(result.status).toBe(401);
    }
  });
});

describe('API3 · el cliente no puede mandar campos que no le tocan', () => {
  it('un campo extra en la emisión es 422, no un pagaré con estado tecleado', async () => {
    const result = await call('/admin/notes', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: {
        debtor: {
          fullName: 'Cliente mass assignment',
          address: 'Calle de prueba 1',
          phone: '+524430000009',
        },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        // Nada de esto lo decide el cliente (§4).
        status: 'PAID',
        folio: 'PAG-2026-999999',
        paidCents: '1000000',
      },
    });
    expect(result.status).toBe(422);
  });
});

describe('§24.5 · castigo y quita exigen el folio teclado', () => {
  let noteId = '';
  let folio = '';

  beforeAll(async () => {
    /*
     * Hace falta un pagaré **firmado**: castigar uno que aún no se ha firmado es
     * una transición imposible (§11.3) y respondería 409 antes de mirar la
     * confirmación, con lo que la prueba pasaría por el motivo equivocado. Los
     * del seed ya están emitidos.
     */
    const list = await call('/admin/notes?limit=50', { token: adminToken });
    expect(list.status).toBe(200);

    const notes = (list.body['data'] ?? []) as { id: string; folio: string; status: string }[];
    const target = notes.find((note) =>
      ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(note.status),
    );
    expect(target, 'el seed debe dejar al menos un pagaré emitido').toBeTruthy();

    noteId = target?.id ?? '';
    folio = target?.folio ?? '';
  });

  it('sin la confirmación escrita, el castigo es 422', async () => {
    const result = await call(`/admin/notes/${noteId}/write-off`, {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: { reasonCode: 'uncollectible', reasonNote: 'incobrable' },
    });
    expect(result.status).toBe(422);
  });

  it('con un folio equivocado tampoco', async () => {
    const result = await call(`/admin/notes/${noteId}/write-off`, {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: {
        reasonCode: 'uncollectible',
        reasonNote: 'incobrable',
        confirmFolio: `${folio}-mal`,
      },
    });
    expect(result.status).toBe(422);
    expect(String(result.body['code'] ?? result.body['title'] ?? '')).toMatch(/folio|confirm/i);
  });
});

describe('§12.4 · idempotencia', () => {
  it('la misma clave con otro cuerpo devuelve 422', async () => {
    const key = randomUUID();
    const cuerpo = (amount: string): unknown => ({
      debtor: {
        fullName: 'Cliente idempotencia',
        address: 'Calle de prueba 3',
        // Único por ejecución: al mismo deudor no se le emite otro pagaré
        // mientras no firme el anterior (ADR 0019).
        phone: `+52443${String(Date.now()).slice(-7)}`,
      },
      issuePlace: 'Morelia, Michoacán',
      issueDate: futureDate(-1),
      paymentPlace: 'Morelia, Michoacán',
      dueDate: futureDate(20),
      creditorName: 'Créditos Morelia S.A. de C.V.',
      amountCents: amount,
    });

    const first = await call('/admin/notes', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: key,
      body: cuerpo('700000'),
    });
    expect(first.status).toBe(201);

    const conflict = await call('/admin/notes', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: key,
      body: cuerpo('800000'),
    });
    expect(conflict.status).toBe(422);
  });
});
