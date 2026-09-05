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
  /** Para probar cuotas ya vencidas hace falta expedir antes del vencimiento. */
  issueDate = futureDate(-1),
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
      issueDate,
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

/**
 * El interés ordinario dentro del abono (§12.3, ADR 0020).
 *
 * La cuota de un plan lleva dentro el precio del préstamo. Hasta que esto
 * existió, un abono a una cuota al corriente se registraba **entero a capital**:
 * el recibo le decía al deudor que había pagado capital cuando pagó interés, y
 * la ganancia de quien presta se contaba como devolución.
 */
async function trazoUnico(): Promise<Buffer> {
  /*
   * Un trazo distinto en cada firma: la misma imagen no vale para dos pagarés
   * (ADR 0021). Se dibujan unos pixeles negros al azar sobre el lienzo, que es
   * lo más parecido a que nadie firma dos veces igual.
   */
  const sharp = (await import('sharp')).default;
  const ancho = 400;
  const alto = 160;
  const lienzo = Buffer.alloc(ancho * alto * 3, 255);
  for (let i = 0; i < 400; i += 1) {
    const p = Math.floor(Math.random() * ancho * alto) * 3;
    lienzo[p] = 0;
    lienzo[p + 1] = 0;
    lienzo[p + 2] = 0;
  }
  return sharp(lienzo, { raw: { width: ancho, height: alto, channels: 3 } }).png().toBuffer();
}

describe('§12.3 · el abono distingue el precio del préstamo de la sanción', () => {
  /** Firma un pagaré por la vía del administrador para poder abonarle. */
  async function abonar(
    noteId: string,
    amountCents: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return call(`/admin/notes/${noteId}/payments`, {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: { amountCents, paidOn: futureDate(0), method: 'TRANSFER' },
    });
  }

  /** Emite una serie con plan e importa su primera cuota ya firmada. */
  async function serieFirmada(): Promise<{ id: string; amountCents: string }> {
    const emision = await emitir(12, '6000000', futureDate(30), {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    expect(emision.status).toBe(201);
    const primera = (emision.body['series'] as { notes: SerieNota[] }).notes[0] as SerieNota;

    // Un pagaré sin firmar no admite abonos (§11.3), así que se firma por la
    // vía del panel, que es la que existe sin aplicación de por medio.
    const trazo = await trazoUnico();

    const form = new FormData();
    form.append('signature', new Blob([new Uint8Array(trazo)], { type: 'image/png' }), 'firma.png');
    form.append(
      'payload',
      JSON.stringify({ capturedAt: new Date().toISOString(), strokeCount: 3, mode: 'IN_PERSON' }),
    );
    const firmado = await fetch(`${API}/notes/${primera.id}/signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });
    expect(firmado.status, 'la primera cuota queda firmada').toBe(201);

    return { id: primera.id, amountCents: primera.amountCents };
  }

  it('lo primero que cubre un abono es el precio del préstamo', async () => {
    // $60,000 al 3 % mensual: la primera cuota lleva $1,800 de interés
    // ordinario, y hasta ahí llega el abono antes de tocar el capital.
    const cuota = await serieFirmada();
    const abono = await abonar(cuota.id, '200000');

    expect(abono.status).toBe(201);
    expect(abono.body['appliedToOrdinaryInterestCents']).toBe('180000');
    expect(abono.body['appliedToInterestCents']).toBe('0'); // no hay atraso
    expect(abono.body['appliedToPrincipalCents']).toBe('20000');
  });

  it('los tres conceptos suman exactamente el abono', async () => {
    // Si sobrara o faltara un centavo, el saldo dejaría de cuadrar con el libro.
    const cuota = await serieFirmada();
    const abono = await abonar(cuota.id, '350000');

    const suma =
      BigInt(String(abono.body['appliedToOrdinaryInterestCents'])) +
      BigInt(String(abono.body['appliedToInterestCents'])) +
      BigInt(String(abono.body['appliedToPrincipalCents']));
    expect(suma).toBe(350_000n);
  });

  it('el interés ya cubierto no se vuelve a cobrar', async () => {
    const cuota = await serieFirmada();
    await abonar(cuota.id, '200000');
    const segundo = await abonar(cuota.id, '200000');

    // El precio del préstamo se pagó con el primer abono: el segundo es capital.
    expect(segundo.body['appliedToOrdinaryInterestCents']).toBe('0');
    expect(segundo.body['appliedToPrincipalCents']).toBe('200000');
  });

  it('el detalle enseña de qué está hecha la cuota', async () => {
    const cuota = await serieFirmada();
    const detalle = await call(`/admin/notes/${cuota.id}`, { token: adminToken });

    const desglose = detalle.body['breakdown'] as Record<string, Record<string, string>>;
    expect(desglose['model']).toBe('INSOLUTOS');
    expect(desglose['interest']?.['cents']).toBe('180000');
    // Interés más capital es la cuota entera: es lo que el deudor firma.
    expect(
      BigInt(desglose['interest']?.['cents'] ?? '0') +
        BigInt(desglose['principal']?.['cents'] ?? '0'),
    ).toBe(BigInt(cuota.amountCents));
  });

  it('un pagaré suelto no tiene desglose que enseñar', async () => {
    // No lleva interés dentro: su importe es capital y nada más.
    const suelto = await emitir(1, '1000000');
    const detalle = await call(`/admin/notes/${String(suelto.body['id'])}`, { token: adminToken });

    expect(detalle.body['breakdown']).toBeNull();
  });
});

/**
 * Sobre qué corre el moratorio (ADR 0020).
 *
 * El art. 363 del Código de Comercio dice que los intereses vencidos y no
 * pagados no devengan intereses salvo pacto de capitalizarlos. La cuota de un
 * plan lleva su interés ordinario dentro, así que cobrar mora sobre la cuota
 * entera es justamente eso.
 */
describe('§12.3 · la mora no corre sobre el interés de la cuota', () => {
  it('una cuota vencida devenga menos que un pagaré suelto del mismo importe', async () => {
    /*
     * Los dos deben lo mismo y llevan la misma tasa; lo único que cambia es que
     * la cuota lleva el precio del préstamo dentro. Si la mora fuera igual en
     * los dos, se estaría cobrando interés sobre interés.
     */
    const serie = await emitir(
      12,
      '6000000',
      futureDate(-20),
      { model: 'INSOLUTOS', rate: { value: 3, period: 'MONTHLY' } },
      futureDate(-50),
    );
    expect(serie.status).toBe(201);
    const cuota = (serie.body['series'] as { notes: SerieNota[] }).notes[0] as SerieNota;

    const suelto = await emitir(1, cuota.amountCents, futureDate(-20), undefined, futureDate(-50));
    expect(suelto.status).toBe(201);

    const [conPlan, sinPlan] = await Promise.all([
      call(`/admin/notes/${cuota.id}`, { token: adminToken }),
      call(`/admin/notes/${String(suelto.body['id'])}`, { token: adminToken }),
    ]);

    const mora = (r: typeof conPlan): bigint =>
      BigInt((r.body['accruedInterest'] as Record<string, string>)['cents'] ?? '0');

    expect(mora(sinPlan)).toBeGreaterThan(0n);
    expect(mora(conPlan)).toBeGreaterThan(0n);
    expect(mora(conPlan)).toBeLessThan(mora(sinPlan));
  });
});

/**
 * La misma firma no vale para dos pagarés (ADR 0021).
 *
 * Cada título se firma por separado y con su propio trazo. Dos documentos con
 * la misma imagen al byte no son dos firmas: son una copiada, y convertiría
 * doce actos de voluntad en uno solo replicado por el servidor.
 */
describe('§8 · una firma, un pagaré', () => {
  it('reenviar el mismo trazo a otra cuota es 409', async () => {
    const emision = await emitir(3, '900000', futureDate(30), {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const notas = (emision.body['series'] as { notes: SerieNota[] }).notes;
    const trazo = await trazoUnico();

    const firmar = async (noteId: string): Promise<Response> => {
      const form = new FormData();
      form.append('signature', new Blob([new Uint8Array(trazo)], { type: 'image/png' }), 'firma.png');
      form.append(
        'payload',
        JSON.stringify({ capturedAt: new Date().toISOString(), strokeCount: 3, mode: 'IN_PERSON' }),
      );
      return fetch(`${API}/notes/${noteId}/signature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: form,
      });
    };

    const primera = await firmar(String(notas[0]?.id));
    expect(primera.status).toBe(201);

    // Nadie dibuja dos veces exactamente lo mismo: si el hash coincide, es que
    // se reenvió el trazo anterior.
    const segunda = await firmar(String(notas[1]?.id));
    expect(segunda.status).toBe(409);
    const problema = (await segunda.json()) as Record<string, unknown>;
    expect(String(problema['type'])).toContain('signature_reused');
    // El folio donde ya se usó va en el mensaje: es lo que permite entenderlo.
    expect(String(problema['title'])).toContain(String(notas[0]?.folio));
  });

  it('con su propio trazo, cada cuota se firma sin problema', async () => {
    const emision = await emitir(2, '900000', futureDate(30), {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const notas = (emision.body['series'] as { notes: SerieNota[] }).notes;

    for (const nota of notas) {
      const form = new FormData();
      const trazo = await trazoUnico();
      form.append('signature', new Blob([new Uint8Array(trazo)], { type: 'image/png' }), 'firma.png');
      form.append(
        'payload',
        JSON.stringify({ capturedAt: new Date().toISOString(), strokeCount: 3, mode: 'IN_PERSON' }),
      );
      const r = await fetch(`${API}/notes/${nota.id}/signature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: form,
      });
      expect(r.status, `firma de la cuota ${nota.index}`).toBe(201);
    }
  });
});
