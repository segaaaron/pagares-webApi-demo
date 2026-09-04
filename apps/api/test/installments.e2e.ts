import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Serie de pagarés: una mensualidad, un pagaré (§12).
 *
 * Un pagaré es un título de pago único, así que documentar doce mensualidades es
 * firmar doce títulos numerados. Lo que estas pruebas protegen es lo que se
 * rompe callado: que las cuotas sumen exactamente la deuda, que cada una tenga
 * su propio folio y que los vencimientos caigan mes a mes.
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

function futureDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

let adminToken = '';

interface SerieNota {
  id: string;
  folio: string;
  index: number;
  dueDate: string;
  amountCents: string;
}

/** Emite y devuelve la serie completa. */
async function emitir(
  installments: number,
  amountCents: string,
  dueDate = futureDate(30),
): Promise<{ status: number; body: Record<string, unknown> }> {
  return call('/admin/notes', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: {
      debtor: {
        fullName: `Serie ${Date.now()}`,
        address: 'Calle de prueba 1',
        phone: `+52443${String(Date.now()).slice(-7)}`,
      },
      issuePlace: 'Morelia, Michoacán',
      issueDate: futureDate(-1),
      paymentPlace: 'Morelia, Michoacán',
      dueDate,
      creditorName: 'Créditos Morelia S.A. de C.V.',
      amountCents,
      interestRate: { value: 3, period: 'MONTHLY' },
      installments,
    },
  });
}

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN });
  if (login.status === 429) throw new Error('La API está limitando los accesos (429).');
  expect(login.status).toBe(200);
  adminToken = String(login.body['accessToken']);
});

describe('§12 · emitir la deuda en varios pagos', () => {
  it('un pago sigue siendo un pagaré suelto, sin serie', async () => {
    // El caso normal no cambia: quien no pide plazos emite uno y ya.
    const resultado = await emitir(1, '1000000');

    expect(resultado.status).toBe(201);
    expect(resultado.body['series']).toBeNull();
    expect(resultado.body['folio']).toMatch(/^PAG-\d{4}-\d{6}$/);
  });

  it('doce pagos son doce pagarés, cada uno con su folio', async () => {
    const resultado = await emitir(12, '6000000');
    expect(resultado.status).toBe(201);

    const serie = resultado.body['series'] as { id: string; size: number; notes: SerieNota[] };
    expect(serie.size).toBe(12);
    expect(serie.notes).toHaveLength(12);

    // Un folio por título: cada pagaré se reclama por separado, y dos con el
    // mismo número serían indistinguibles en un juicio.
    const folios = serie.notes.map((nota) => nota.folio);
    expect(new Set(folios).size).toBe(12);
    for (const folio of folios) expect(folio).toMatch(/^PAG-\d{4}-\d{6}$/);
  });

  it('las cuotas suman exactamente la deuda', async () => {
    /*
     * La regla que no se puede romper. $60,000 entre 7 no da exacto, y si el
     * reparto pierde o inventa un centavo, el deudor acaba debiendo algo que
     * nadie sabe explicar.
     */
    const resultado = await emitir(7, '6000000');
    const serie = resultado.body['series'] as { notes: SerieNota[] };

    const suma = serie.notes.reduce((total, nota) => total + BigInt(nota.amountCents), 0n);
    expect(suma).toBe(6_000_000n);
  });

  it('el sobrante va en la primera cuota, no en la última', async () => {
    const resultado = await emitir(7, '6000000');
    const serie = resultado.body['series'] as { notes: SerieNota[] };

    const primera = BigInt(serie.notes[0]?.amountCents ?? '0');
    const resto = serie.notes.slice(1).map((nota) => BigInt(nota.amountCents));
    // Las demás son todas iguales; la primera carga con la diferencia.
    expect(new Set(resto.map(String)).size).toBe(1);
    expect(primera).toBeGreaterThanOrEqual(resto[0] as bigint);
  });

  it('los vencimientos van mes a mes desde el pactado', async () => {
    const resultado = await emitir(3, '3000000', '2027-01-31');
    const serie = resultado.body['series'] as { notes: SerieNota[] };

    // Y el 31 cae al último día del mes que no lo tiene, en vez de desbordarse
    // al mes siguiente.
    expect(serie.notes.map((nota) => nota.dueDate)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('van en orden y numerados del uno al último', async () => {
    const resultado = await emitir(4, '2000000');
    const serie = resultado.body['series'] as { notes: SerieNota[] };

    expect(serie.notes.map((nota) => nota.index)).toEqual([1, 2, 3, 4]);
  });

  it('la respuesta encabeza con el primer pagaré de la serie', async () => {
    // Es el que se abre y el que se manda a firmar: si respondiera con otro, la
    // pantalla siguiente enseñaría el pagaré equivocado.
    const resultado = await emitir(5, '2500000');
    const serie = resultado.body['series'] as { notes: SerieNota[] };

    expect(resultado.body['id']).toBe(serie.notes[0]?.id);
    expect(resultado.body['folio']).toBe(serie.notes[0]?.folio);
  });

  it('un importe que no da ni un centavo por cuota es 422', async () => {
    const resultado = await emitir(24, '10');
    expect(resultado.status).toBe(422);
  });

  it('más de veinticuatro pagos es 422', async () => {
    const resultado = await emitir(25, '6000000');
    expect(resultado.status).toBe(422);
  });

  it('cada pagaré de la serie se abre por su cuenta', async () => {
    const resultado = await emitir(3, '900000');
    const serie = resultado.body['series'] as { notes: SerieNota[] };

    for (const nota of serie.notes) {
      const detalle = await call(`/admin/notes/${nota.id}`, { token: adminToken });
      expect(detalle.status).toBe(200);
      expect(detalle.body['folio']).toBe(nota.folio);
      // Cada uno con su propio importe, no con el total de la deuda.
      expect((detalle.body['amount'] as Record<string, string>)['cents']).toBe(nota.amountCents);
    }
  });
});
