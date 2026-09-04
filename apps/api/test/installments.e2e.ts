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
  plan?: { model: 'NONE' | 'INSOLUTOS' | 'GLOBAL'; rate?: { value: number; period: 'MONTHLY' } },
): Promise<{ status: number; body: Record<string, unknown> }> {
  return call('/admin/notes', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: {
      ...(plan ? { plan: { model: plan.model, rate: plan.rate ?? null } } : {}),
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

describe('§12 · el plan de pagos y lo que gana quien presta', () => {
  it('sobre saldos insolutos, la cuota lleva interés y capital', async () => {
    /*
     * El interés **ordinario** es el precio del préstamo: lo que gana el
     * prestamista desde que entrega el dinero hasta que se lo devuelven. No es
     * el moratorio, que sólo castiga el atraso (§12.3).
     */
    const resultado = await emitir(12, '6000000', futureDate(30), {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    expect(resultado.status).toBe(201);

    const serie = resultado.body['series'] as {
      notes: SerieNota[];
      plan: { model: string; principalCents: string; totalInterestCents: string; totalCents: string };
    };

    expect(serie.plan.model).toBe('INSOLUTOS');
    expect(serie.plan.principalCents).toBe('6000000');
    // 60,000 a 3 % mensual en 12 cuotas: la ganancia ronda los 12,300.
    expect(BigInt(serie.plan.totalInterestCents)).toBeGreaterThan(1_200_000n);
    expect(BigInt(serie.plan.totalCents)).toBe(
      BigInt(serie.plan.principalCents) + BigInt(serie.plan.totalInterestCents),
    );

    // Y cada pagaré vale su cuota, no su parte del capital.
    const suma = serie.notes.reduce((total, nota) => total + BigInt(nota.amountCents), 0n);
    expect(suma).toBe(BigInt(serie.plan.totalCents));
  });

  it('sobre saldo global sale más caro con la misma tasa', async () => {
    // Es el hecho que la pantalla enseña antes de emitir: con la misma tasa
    // nominal, el deudor paga bastante más.
    const insolutos = await emitir(12, '6000000', futureDate(30), {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const global = await emitir(12, '6000000', futureDate(30), {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });

    const ganancia = (r: typeof insolutos): bigint =>
      BigInt((r.body['series'] as { plan: { totalInterestCents: string } }).plan.totalInterestCents);

    expect(ganancia(global)).toBeGreaterThan(ganancia(insolutos));
    // 60,000 × 3 % × 12 = 21,600, calculado siempre sobre el importe original.
    expect(ganancia(global)).toBe(2_160_000n);
  });

  it('sin plan, las cuotas siguen repartiendo sólo el préstamo', async () => {
    const resultado = await emitir(6, '6000000');
    const serie = resultado.body['series'] as {
      notes: SerieNota[];
      plan: { totalInterestCents: string };
    };

    expect(serie.plan.totalInterestCents).toBe('0');
    const suma = serie.notes.reduce((total, nota) => total + BigInt(nota.amountCents), 0n);
    expect(suma).toBe(6_000_000n);
  });

  it('un plan con interés y sin tasa es 422', async () => {
    // Sería un plan sin interés con más pasos, y con una promesa falsa dentro.
    const resultado = await emitir(12, '6000000', futureDate(30), { model: 'INSOLUTOS' });
    expect(resultado.status).toBe(422);
  });

  it('un plan con interés sobre un solo pago es 422', async () => {
    const resultado = await emitir(1, '6000000', futureDate(30), {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });
    expect(resultado.status).toBe(422);
  });
});


describe('§12 · liquidación anticipada', () => {
  it('sobre saldos insolutos, liquidar hoy es devolver el capital', async () => {
    /*
     * El interés ordinario es el precio del tiempo: si el dinero vuelve antes,
     * ese tiempo no transcurre. Nadie ha abonado ni ha vencido nada, así que lo
     * que se debe hoy es exactamente lo prestado.
     */
    const emision = await emitir(12, '6000000', futureDate(30), {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const primera = (emision.body['series'] as { notes: SerieNota[] }).notes[0] as SerieNota;

    const resultado = await call(`/admin/notes/${primera.id}/early-payoff`, { token: adminToken });

    expect(resultado.status).toBe(200);
    expect(resultado.body['planModel']).toBe('INSOLUTOS');
    expect(resultado.body['pendingCount']).toBe(12);
    expect((resultado.body['principal'] as Record<string, string>)['cents']).toBe('6000000');
    expect((resultado.body['total'] as Record<string, string>)['cents']).toBe('6000000');
    expect(BigInt((resultado.body['saved'] as Record<string, string>)['cents'] ?? '0')).toBeGreaterThan(0n);
  });

  it('sobre saldo global, adelantar no ahorra un peso', async () => {
    // Se pactó sobre el importe original, y eso es lo que se firmó: la pantalla
    // lo dice en vez de insinuar un descuento que no existe.
    const emision = await emitir(12, '6000000', futureDate(30), {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const primera = (emision.body['series'] as { notes: SerieNota[] }).notes[0] as SerieNota;

    const resultado = await call(`/admin/notes/${primera.id}/early-payoff`, { token: adminToken });

    expect((resultado.body['saved'] as Record<string, string>)['cents']).toBe('0');
    // 60,000 de capital más 21,600 de interés pactado.
    expect((resultado.body['total'] as Record<string, string>)['cents']).toBe('8160000');
  });

  it('la cifra es la de la serie entera, no la del pagaré abierto', async () => {
    // Liquidar es saldar la deuda; preguntarlo desde la quinta cuota no puede
    // contestar sólo por la quinta.
    const emision = await emitir(6, '6000000', futureDate(30), {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const notas = (emision.body['series'] as { notes: SerieNota[] }).notes;
    const quinta = notas[4] as SerieNota;

    const resultado = await call(`/admin/notes/${quinta.id}/early-payoff`, { token: adminToken });

    expect(resultado.body['pendingCount']).toBe(6);
    expect((resultado.body['principal'] as Record<string, string>)['cents']).toBe('6000000');
  });

  it('liquidar en el pasado es 422', async () => {
    const emision = await emitir(3, '900000');
    const primera = (emision.body['series'] as { notes: SerieNota[] }).notes[0] as SerieNota;

    const resultado = await call(
      `/admin/notes/${primera.id}/early-payoff?date=${futureDate(-5)}`,
      { token: adminToken },
    );
    expect(resultado.status).toBe(422);
  });

  it('sin sesión no se contesta', async () => {
    const emision = await emitir(3, '900000');
    const primera = (emision.body['series'] as { notes: SerieNota[] }).notes[0] as SerieNota;

    const resultado = await call(`/admin/notes/${primera.id}/early-payoff`);
    expect(resultado.status).toBe(401);
  });
});
