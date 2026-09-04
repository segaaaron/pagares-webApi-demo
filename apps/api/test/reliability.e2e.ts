import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Concurrencia y sesión: lo que sólo se rompe cuando dos cosas pasan a la vez
 * (§25.9, nivel «idempotencia y fiabilidad»).
 *
 * Las unitarias del dominio comprueban la regla; éstas comprueban que la regla
 * sobrevive a dos peticiones simultáneas contra Postgres real. Son tres hechos
 * que ninguna prueba de un solo hilo puede ver:
 *
 *  · dos altas a la vez no repiten folio (§4, secuencia de `numbering`);
 *  · dos abonos a la vez no sobrepasan el saldo (§12.2, bloqueo de fila);
 *  · un refresh canjeado dos veces mata la familia entera (§10.4, ADR 0001).
 *
 * Y una cuarta que es de tiempo, no de concurrencia: el bloqueo por intentos
 * fallidos es **por cuenta**, no por IP (§10.2).
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
  cookie?: string;
}

interface Answer {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

async function call(path: string, init: Call = {}): Promise<Answer> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;
  if (init.cookie) headers.Cookie = init.cookie;

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

/** El código del catálogo (§14.4) viaja en el `type` de problem+json. */
function problem(answer: Answer): string {
  return String(answer.body['type'] ?? '').split('/').pop() ?? '';
}

/** El refresh viaja en cookie httpOnly: aquí se lee a mano porque no hay navegador. */
function refreshCookie(headers: Headers): string {
  const raw = headers.getSetCookie().find((cookie) => cookie.startsWith('pagares_refresh='));
  if (!raw) throw new Error('La respuesta no trae la cookie de refresh');
  return raw.split(';')[0] ?? '';
}

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function unique(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

let adminToken = '';

/** Datos mínimos de un pagaré nuevo; el resto lo pone el servidor (§4). */
function noteBody(label: string, phone: string): Record<string, unknown> {
  return {
    debtor: { fullName: `Concurrencia ${label}`, address: 'Calle de prueba 1', phone },
    issuePlace: 'Morelia, Michoacán',
    issueDate: futureDate(-2),
    paymentPlace: 'Morelia, Michoacán',
    dueDate: futureDate(30),
    creditorName: 'Créditos Morelia S.A. de C.V.',
    amountCents: '1000000',
    interestRate: { value: 2, period: 'MONTHLY' },
  };
}

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN });
  if (login.status === 429) {
    throw new Error(
      'La API está limitando los accesos (429). Reinicia la API o sube RATE_LIMIT_AUTH_PER_15M.',
    );
  }
  expect(login.status).toBe(200);
  adminToken = String(login.body['accessToken']);
});

describe('§4 · dos altas simultáneas no repiten folio', () => {
  it('cinco emisiones a la vez producen cinco folios distintos', async () => {
    const label = unique();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        call('/admin/notes', {
          method: 'POST',
          token: adminToken,
          idempotencyKey: randomUUID(),
          body: noteBody(`${label}-${index}`, `+52443${String(Date.now() + index).slice(-7)}`),
        }),
      ),
    );

    for (const result of results) expect(result.status).toBe(201);

    const folios = results.map((result) => String(result.body['folio']));
    // Si la secuencia se leyera fuera de la transacción, dos de estas cinco
    // traerían el mismo folio y el pagaré duplicado sería indistinguible.
    expect(new Set(folios).size).toBe(5);
    for (const folio of folios) expect(folio).toMatch(/^PAG-\d{4}-\d{6}$/);
  });
});

describe('§12.2 · dos abonos simultáneos no sobrepasan el saldo', () => {
  let noteId = '';

  beforeAll(async () => {
    /*
     * Hace falta un pagaré que admita abonos, y eso exige firma. La vía barata
     * es la importación (§24.5): entra como firmado en papel, sin trazo digital
     * ni multipart. El deudor tiene que existir antes, así que primero se emite
     * un pagaré normal —que es lo que da de alta al deudor— y luego se importa
     * el segundo contra ese mismo teléfono.
     */
    const phone = `+52443${String(Date.now()).slice(-7)}`;
    const seed = await call('/admin/notes', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: noteBody(`abonos-${unique()}`, phone),
    });
    expect(seed.status).toBe(201);

    const csv = [
      'telefono_deudor,importe,fecha_emision,vencimiento,abonado',
      `${phone},10000.00,${futureDate(-40)},${futureDate(60)},0`,
    ].join('\n');

    const imported = await call('/admin/imports/notes', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: { csv, commit: true },
    });
    expect(imported.status).toBe(200);
    expect(imported.body['committed']).toBe(true);

    const listed = await call(`/admin/notes?q=${encodeURIComponent(phone)}&limit=20`, {
      token: adminToken,
    });
    expect(listed.status).toBe(200);
    const rows = listed.body['data'] as Array<Record<string, unknown>>;
    const signed = rows.find((row) => row['hasSignature'] === true);
    expect(signed, 'la importación deja el pagaré como firmado en papel').toBeTruthy();
    noteId = String(signed?.['id']);
  });

  it('el segundo abono se rechaza y el saldo queda exacto', async () => {
    // Seis mil cada uno sobre un saldo de diez mil: juntos no caben. Sin el
    // bloqueo de fila, ambos leerían el mismo saldo y el pagaré terminaría con
    // saldo negativo, que es el defecto que esta prueba existe para impedir.
    const payment = { amountCents: '600000', paidOn: futureDate(0), method: 'CASH' };
    const [first, second] = await Promise.all([
      call(`/admin/notes/${noteId}/payments`, {
        method: 'POST',
        token: adminToken,
        idempotencyKey: randomUUID(),
        body: payment,
      }),
      call(`/admin/notes/${noteId}/payments`, {
        method: 'POST',
        token: adminToken,
        idempotencyKey: randomUUID(),
        body: payment,
      }),
    ]);

    const statuses = [first!.status, second!.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 422]);

    const rejected = [first!, second!].find((result) => result.status === 422)!;
    expect(problem(rejected)).toBe('payment_exceeds_balance');

    const detail = await call(`/admin/notes/${noteId}`, { token: adminToken });
    expect(detail.status).toBe(200);
    const balance = detail.body['balance'] as Record<string, unknown>;
    expect(balance['cents']).toBe('400000');
  });
});

describe('§10.4 · un refresh canjeado dos veces mata la familia', () => {
  let cookie = '';
  let rotated = '';

  beforeAll(async () => {
    const email = `refresh-${unique()}@ejemplo.mx`;
    const created = await call('/admin/users', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: { email, fullName: 'Cliente refresh', role: 'CLIENT' },
    });
    expect(created.status).toBe(201);

    const challenge = await call('/auth/login', {
      method: 'POST',
      body: { email, password: String(created.body['temporaryPassword']) },
    });
    expect(challenge.body['outcome']).toBe('must_change_password');

    // El cambio inicial ya deja sesión abierta (ADR 0002), así que de aquí sale
    // la primera cookie de refresh sin un login extra.
    const session = await call('/auth/password/change-initial', {
      method: 'POST',
      body: {
        changeToken: String(challenge.body['changeToken']),
        newPassword: `Refresh-${unique()}-2026!`,
      },
    });
    expect(session.status).toBe(200);
    cookie = refreshCookie(session.headers);
  });

  it('la rotación normal devuelve una cookie nueva', async () => {
    const result = await call('/auth/refresh', { method: 'POST', cookie });
    expect(result.status).toBe(200);
    expect(result.body['accessToken']).toBeTruthy();
    rotated = refreshCookie(result.headers);
    expect(rotated).not.toBe(cookie);
  });

  it('reutilizar el refresh viejo es 401', async () => {
    const reused = await call('/auth/refresh', { method: 'POST', cookie });
    expect(reused.status).toBe(401);
    expect(problem(reused)).toBe('refresh_reused');
  });

  it('y arrastra al refresh bueno: la familia entera queda revocada', async () => {
    // Ésta es la regla que importa. Detectar la reutilización y dejar viva la
    // sesión del ladrón no serviría de nada: se revoca la familia completa.
    const after = await call('/auth/refresh', { method: 'POST', cookie: rotated });
    expect(after.status).toBe(401);
    expect(problem(after)).toBe('refresh_reused');
  });
});

describe('§10.2 · el bloqueo por intentos fallidos es por cuenta', () => {
  it('al sexto intento la cuenta responde 423, no 401', async () => {
    const email = `lockout-${unique()}@ejemplo.mx`;
    const created = await call('/admin/users', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: { email, fullName: 'Cliente bloqueo', role: 'CLIENT' },
    });
    expect(created.status).toBe(201);

    // Cinco fallos son el umbral (`MAX_FAILED_LOGINS`); el sexto ya encuentra la
    // cuenta bloqueada. Van en serie a propósito: el contador es acumulativo y
    // en paralelo se pisarían las escrituras.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await call('/auth/login', {
        method: 'POST',
        body: { email, password: 'contrasena-incorrecta' },
      });
      expect(failed.status, `intento ${attempt + 1}`).toBe(401);
    }

    const locked = await call('/auth/login', {
      method: 'POST',
      body: { email, password: 'contrasena-incorrecta' },
    });
    expect(locked.status).toBe(423);
    expect(problem(locked)).toBe('account_locked');

    // Y con la contraseña buena tampoco: el bloqueo no depende de acertar.
    const correct = await call('/auth/login', {
      method: 'POST',
      body: { email, password: String(created.body['temporaryPassword']) },
    });
    expect(correct.status).toBe(423);
  });
});

describe('§24.1 · la cadena de la bitácora aguanta la concurrencia', () => {
  it('diez operaciones a la vez no rompen el encadenado', async () => {
    /*
     * Regresión de un fallo propio. Cada movimiento de la bitácora guarda el
     * hash del anterior; para calcularlo hay que leer la punta de la cadena y
     * escribir detrás. Sin serializar ese añadido, dos operaciones simultáneas
     * leían la misma punta y escribían dos eslabones con el mismo padre: la
     * comprobación de integridad decía «alterada» sin que nadie hubiera tocado
     * nada.
     *
     * Y eso no es un falso positivo cualquiera: a la tercera falsa alarma nadie
     * vuelve a mirar la comprobación, que es justo lo que la deja de servir.
     */
    const antes = await call('/admin/audit/verify', { token: adminToken });
    expect(antes.status).toBe(200);

    const label = unique();
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        call('/admin/notes', {
          method: 'POST',
          token: adminToken,
          idempotencyKey: randomUUID(),
          body: noteBody(`cadena-${label}-${index}`, `+52443${String(Date.now() + index).slice(-7)}`),
        }),
      ),
    );

    const despues = await call('/admin/audit/verify', { token: adminToken });
    expect(despues.status).toBe(200);

    /*
     * Se compara contra el estado previo y no contra `true` a secas: una base de
     * desarrollo puede arrastrar una cadena ya rota de antes, y esta prueba
     * afirma lo suyo —que **estas** escrituras no la rompen—, no que el pasado
     * esté limpio.
     */
    if (antes.body['intact'] === true) {
      expect(despues.body['intact'], 'diez escrituras simultáneas rompieron la cadena').toBe(true);
    } else {
      expect(Number(despues.body['brokenAt'])).toBe(Number(antes.body['brokenAt']));
    }
  });
});

