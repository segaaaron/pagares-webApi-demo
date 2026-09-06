import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Un pagaré con su tabla de amortización (§12, ADR 0022).
 *
 * Un préstamo que se devuelve en cuotas es **un** título por el total y su
 * calendario, que es lo que contemplan los arts. 17 y 130 LGTOC al obligar al
 * acreedor a recibir abonos. Lo que estas pruebas protegen es lo que se rompe
 * callado: que las cuotas sumen exactamente lo que dice el título, que el
 * vencimiento del pagaré sea el de la última y que emitir siga dando un folio.
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

interface Cuota {
  index: number;
  dueOn: string;
  amountCents: string;
  interestCents: string;
  principalCents: string;
}

interface Calendario {
  size: number;
  frequency: string;
  installments: Cuota[];
  plan: {
    model: string;
    principalCents: string;
    totalInterestCents: string;
    totalCents: string;
  };
}

/**
 * Da de alta una ficha y devuelve su identificador.
 *
 * Emitir ya no crea deudores: la ficha se da de alta en Deudores y el pagaré la
 * elige. Cada prueba estrena la suya para no toparse con la regla del ADR 0019.
 */
async function nuevoDeudor(nombre = 'Plan'): Promise<string> {
  const creado = await call('/admin/debtors', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: {
      fullName: `${nombre} ${Date.now()}`,
      address: 'Calle de prueba 1',
      phone: `+52443${String(Date.now()).slice(-7)}`,
    },
  });
  expect(creado.status, 'el deudor se da de alta').toBe(201);
  return String(creado.body['id']);
}

/** Emite y devuelve el pagaré con su calendario. */
async function emitir(
  installments: number,
  amountCents: string,
  /*
   * El vencimiento ya no se manda: se calcula desde la expedición, la
   * periodicidad y el número de pagos. Para probar cuotas ya vencidas se expide
   * hacia atrás y el calendario cae solo donde tiene que caer.
   */
  issueDate = futureDate(-1),
  plan?: { model: 'NONE' | 'INSOLUTOS' | 'GLOBAL'; rate?: { value: number; period: 'MONTHLY' } },
  paymentFrequency: 'MONTHLY' | 'BIWEEKLY' = 'MONTHLY',
  /** Para emitirle un segundo pagaré a la misma persona. */
  debtorId?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return call('/admin/notes', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: {
      ...(plan ? { plan: { model: plan.model, rate: plan.rate ?? null } } : {}),
      debtor: { id: debtorId ?? (await nuevoDeudor()) },
      issuePlace: 'Morelia, Michoacán',
      issueDate,
      paymentPlace: 'Morelia, Michoacán',
      creditorName: 'Créditos Morelia S.A. de C.V.',
      amountCents,
      interestRate: { value: 3, period: 'MONTHLY' },
      installments,
      paymentFrequency,
    },
  });
}

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN });
  if (login.status === 429) throw new Error('La API está limitando los accesos (429).');
  expect(login.status).toBe(200);
  adminToken = String(login.body['accessToken']);
});

describe('§12 · emitir la deuda pagadera en cuotas', () => {
  it('un pago sigue siendo un pagaré sin calendario', async () => {
    // El caso normal no cambia: quien no pide plazos emite uno y ya.
    const resultado = await emitir(1, '1000000');

    expect(resultado.status).toBe(201);
    expect(resultado.body['schedule']).toBeNull();
    expect(resultado.body['folio']).toMatch(/^PAG-\d{4}-\d{6}$/);
  });

  it('doce pagos son UN pagaré con doce cuotas', async () => {
    /*
     * La regla del ADR 0022, y la que se rompería sin darse cuenta: doce
     * mensualidades no son doce títulos. El deudor pide un pagaré y recibe un
     * pagaré.
     */
    const resultado = await emitir(12, '6000000');
    expect(resultado.status).toBe(201);
    expect(resultado.body['folio']).toMatch(/^PAG-\d{4}-\d{6}$/);

    const calendario = resultado.body['schedule'] as Calendario;
    expect(calendario.size).toBe(12);
    expect(calendario.installments).toHaveLength(12);
  });

  it('las cuotas suman exactamente lo que dice el título', async () => {
    /*
     * $60,000 entre 7 no da exacto, y si el reparto pierde o inventa un
     * centavo el deudor acaba debiendo algo que nadie sabe explicar.
     */
    const resultado = await emitir(7, '6000000');
    const calendario = resultado.body['schedule'] as Calendario;

    const suma = calendario.installments.reduce((total, c) => total + BigInt(c.amountCents), 0n);
    expect(suma).toBe(6_000_000n);
    expect(suma).toBe(BigInt(calendario.plan.totalCents));
  });

  it('el sobrante va en la primera cuota, no en la última', async () => {
    const resultado = await emitir(7, '6000000');
    const cuotas = (resultado.body['schedule'] as Calendario).installments;

    const primera = BigInt(cuotas[0]?.amountCents ?? '0');
    const resto = cuotas.slice(1).map((c) => BigInt(c.amountCents));
    // Las demás son todas iguales; la primera carga con la diferencia.
    expect(new Set(resto.map(String)).size).toBe(1);
    expect(primera).toBeGreaterThanOrEqual(resto[0] as bigint);
  });

  it('las cuotas van mes a mes desde la fecha pactada', async () => {
    const resultado = await emitir(3, '3000000', '2025-12-31');
    const cuotas = (resultado.body['schedule'] as Calendario).installments;

    // Y el 31 cae al último día del mes que no lo tiene, en vez de desbordarse
    // al mes siguiente.
    expect(cuotas.map((c) => c.dueOn)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('el título vence con la última cuota, no con la primera', async () => {
    /*
     * Un solo vencimiento en la literalidad del documento (ADR 0022). El art.
     * 79 LGTOC vuelve pagadero a la vista lo que lleva vencimientos sucesivos
     * dentro; aquí el calendario está al lado del título, no dentro.
     */
    const resultado = await emitir(3, '3000000', '2025-12-31');
    const detalle = await call(`/admin/notes/${String(resultado.body['id'])}`, {
      token: adminToken,
    });

    expect(detalle.body['dueDate']).toBe('2026-03-31');
  });

  it('quincenal son quince días exactos entre cuota y cuota', async () => {
    const resultado = await emitir(4, '4000000', '2026-01-25', undefined, 'BIWEEKLY');
    const calendario = resultado.body['schedule'] as Calendario;

    expect(calendario.frequency).toBe('BIWEEKLY');
    // Y cruzando el fin de mes sin corregir nada: es lo que permite al deudor
    // contar los días él mismo.
    expect(calendario.installments.map((c) => c.dueOn)).toEqual([
      '2026-02-09',
      '2026-02-24',
      '2026-03-11',
      '2026-03-26',
    ]);
  });

  it('quincenal, el título vence con la última quincena', async () => {
    const resultado = await emitir(4, '4000000', '2026-01-25', undefined, 'BIWEEKLY');
    const detalle = await call(`/admin/notes/${String(resultado.body['id'])}`, {
      token: adminToken,
    });

    expect(detalle.body['dueDate']).toBe('2026-03-26');
  });

  it('van en orden y numeradas del uno al último', async () => {
    const resultado = await emitir(4, '2000000');
    const cuotas = (resultado.body['schedule'] as Calendario).installments;

    expect(cuotas.map((c) => c.index)).toEqual([1, 2, 3, 4]);
  });

  it('un importe que no da ni un centavo por cuota es 422', async () => {
    const resultado = await emitir(24, '10');
    expect(resultado.status).toBe(422);
  });

  it('más de veinticuatro cuotas es 422', async () => {
    const resultado = await emitir(25, '6000000');
    expect(resultado.status).toBe(422);
  });

  it('el detalle enseña el calendario con lo que lleva cubierto cada cuota', async () => {
    const emision = await emitir(3, '900000');
    const detalle = await call(`/admin/notes/${String(emision.body['id'])}`, { token: adminToken });

    expect(detalle.status).toBe(200);
    const calendario = detalle.body['schedule'] as {
      size: number;
      installments: { index: number; status: string; balance: { cents: string } }[];
    };
    expect(calendario.size).toBe(3);
    // Sin abonos, las tres pendientes y debiéndose enteras.
    expect(calendario.installments.map((c) => c.status)).toEqual([
      'PENDING',
      'PENDING',
      'PENDING',
    ]);
  });
});

describe('§12 · el plan de pagos y lo que gana quien presta', () => {
  it('sobre saldos insolutos, la cuota lleva interés y capital', async () => {
    /*
     * El interés **ordinario** es el precio del préstamo: lo que gana el
     * prestamista desde que entrega el dinero hasta que se lo devuelven. No es
     * el moratorio, que sólo castiga el atraso (§12.3).
     */
    const resultado = await emitir(12, '6000000', undefined, {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    expect(resultado.status).toBe(201);

    const calendario = resultado.body['schedule'] as Calendario;

    expect(calendario.plan.model).toBe('INSOLUTOS');
    expect(calendario.plan.principalCents).toBe('6000000');
    // 60,000 a 3 % mensual en 12 cuotas: la ganancia ronda los 12,300.
    expect(BigInt(calendario.plan.totalInterestCents)).toBeGreaterThan(1_200_000n);
    expect(BigInt(calendario.plan.totalCents)).toBe(
      BigInt(calendario.plan.principalCents) + BigInt(calendario.plan.totalInterestCents),
    );
  });

  it('lo que dice el título es capital más interés, no sólo lo prestado', async () => {
    /*
     * El pagaré tiene que decir lo que se debe, no lo que se entregó: con
     * interés pactado, las dos cifras no coinciden (ADR 0022).
     */
    const resultado = await emitir(12, '6000000', undefined, {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const calendario = resultado.body['schedule'] as Calendario;
    const detalle = await call(`/admin/notes/${String(resultado.body['id'])}`, {
      token: adminToken,
    });

    // 60,000 de capital más 21,600 de interés pactado.
    expect((detalle.body['amount'] as Record<string, string>)['cents']).toBe('8160000');
    expect(calendario.plan.totalCents).toBe('8160000');
  });

  it('cada cuota desglosa cuánto es interés y cuánto capital', async () => {
    const resultado = await emitir(4, '5000000', undefined, {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const calendario = resultado.body['schedule'] as Calendario;

    for (const cuota of calendario.installments) {
      expect(BigInt(cuota.interestCents) + BigInt(cuota.principalCents)).toBe(
        BigInt(cuota.amountCents),
      );
    }
    // Sobre saldos insolutos el interés baja cuota a cuota: se cobra sobre lo
    // que aún se debe, y cada mes se debe menos.
    const intereses = calendario.installments.map((c) => BigInt(c.interestCents));
    expect(intereses[0]).toBeGreaterThan(intereses[3] as bigint);
  });

  it('sobre saldo global sale más caro con la misma tasa', async () => {
    // Es el hecho que la pantalla enseña antes de emitir: con la misma tasa
    // nominal, el deudor paga bastante más.
    const insolutos = await emitir(12, '6000000', undefined, {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const global = await emitir(12, '6000000', undefined, {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });

    const ganancia = (r: typeof insolutos): bigint =>
      BigInt((r.body['schedule'] as Calendario).plan.totalInterestCents);

    expect(ganancia(global)).toBeGreaterThan(ganancia(insolutos));
    // 60,000 × 3 % × 12 = 21,600, calculado siempre sobre el importe original.
    expect(ganancia(global)).toBe(2_160_000n);
  });

  it('la quincena cobra la mitad de interés que el mes', async () => {
    /*
     * 36 % anual son 3 % al mes y 1.5 % a la quincena. Sin dividir la tasa por
     * los periodos del año, un plan quincenal cobraría el interés de un mes
     * entero cada quince días: el doble de lo pactado, y nadie lo vería hasta
     * que el deudor sumara (§12).
     */
    const mensual = await emitir(4, '5000000', undefined, {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const quincenal = await emitir(
      4,
      '5000000',
      undefined,
      { model: 'GLOBAL', rate: { value: 3, period: 'MONTHLY' } },
      'BIWEEKLY',
    );

    const ganancia = (r: typeof mensual): bigint =>
      BigInt((r.body['schedule'] as Calendario).plan.totalInterestCents);

    // 50,000 × 3 % × 4 = 6,000 al mes; la mitad a la quincena.
    expect(ganancia(mensual)).toBe(600_000n);
    expect(ganancia(quincenal)).toBe(300_000n);
  });

  it('sin plan, las cuotas reparten sólo el préstamo', async () => {
    const resultado = await emitir(6, '6000000');
    const calendario = resultado.body['schedule'] as Calendario;

    expect(calendario.plan.totalInterestCents).toBe('0');
    const suma = calendario.installments.reduce((t, c) => t + BigInt(c.amountCents), 0n);
    expect(suma).toBe(6_000_000n);
  });

  it('un plan con interés y sin tasa es 422', async () => {
    // Sería un plan sin interés con más pasos, y con una promesa falsa dentro.
    const resultado = await emitir(12, '6000000', undefined, { model: 'INSOLUTOS' });
    expect(resultado.status).toBe(422);
  });

  it('un plan con interés sobre un solo pago es 422', async () => {
    const resultado = await emitir(1, '6000000', undefined, {
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
    const emision = await emitir(12, '6000000', undefined, {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });

    const resultado = await call(`/admin/notes/${String(emision.body['id'])}/early-payoff`, {
      token: adminToken,
    });

    expect(resultado.status).toBe(200);
    expect(resultado.body['planModel']).toBe('INSOLUTOS');
    expect(resultado.body['pendingCount']).toBe(12);
    expect((resultado.body['principal'] as Record<string, string>)['cents']).toBe('6000000');
    expect((resultado.body['total'] as Record<string, string>)['cents']).toBe('6000000');
    expect(
      BigInt((resultado.body['saved'] as Record<string, string>)['cents'] ?? '0'),
    ).toBeGreaterThan(0n);
  });

  it('sobre saldo global, adelantar no ahorra un peso', async () => {
    // Se pactó sobre el importe original, y eso es lo que se firmó: la pantalla
    // lo dice en vez de insinuar un descuento que no existe.
    const emision = await emitir(12, '6000000', undefined, {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });

    const resultado = await call(`/admin/notes/${String(emision.body['id'])}/early-payoff`, {
      token: adminToken,
    });

    expect((resultado.body['saved'] as Record<string, string>)['cents']).toBe('0');
    // 60,000 de capital más 21,600 de interés pactado.
    expect((resultado.body['total'] as Record<string, string>)['cents']).toBe('8160000');
  });

  it('contesta por el calendario entero, no por la cuota que toca', async () => {
    // Liquidar es saldar la deuda, y la deuda es el título completo.
    const emision = await emitir(6, '6000000', undefined, {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });

    const resultado = await call(`/admin/notes/${String(emision.body['id'])}/early-payoff`, {
      token: adminToken,
    });

    expect(resultado.body['pendingCount']).toBe(6);
    expect((resultado.body['principal'] as Record<string, string>)['cents']).toBe('6000000');
  });

  it('un pagaré de pago único también se liquida', async () => {
    // No tiene tabla, pero el título entero es su única cuota (ADR 0022).
    const emision = await emitir(1, '1000000');

    const resultado = await call(`/admin/notes/${String(emision.body['id'])}/early-payoff`, {
      token: adminToken,
    });

    expect(resultado.status).toBe(200);
    expect(resultado.body['pendingCount']).toBe(1);
    expect((resultado.body['total'] as Record<string, string>)['cents']).toBe('1000000');
  });

  it('liquidar en el pasado es 422', async () => {
    const emision = await emitir(3, '900000');

    const resultado = await call(
      `/admin/notes/${String(emision.body['id'])}/early-payoff?date=${futureDate(-5)}`,
      { token: adminToken },
    );
    expect(resultado.status).toBe(422);
  });

  it('sin sesión no se contesta', async () => {
    const emision = await emitir(3, '900000');

    const resultado = await call(`/admin/notes/${String(emision.body['id'])}/early-payoff`);
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

  /** Emite un pagaré a plazos y lo firma: sin firma no admite abonos (§11.3). */
  async function planFirmado(): Promise<{ id: string; cuotas: Cuota[] }> {
    const emision = await emitir(12, '6000000', undefined, {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    expect(emision.status).toBe(201);
    const id = String(emision.body['id']);

    const trazo = await trazoUnico();
    const form = new FormData();
    form.append('signature', new Blob([new Uint8Array(trazo)], { type: 'image/png' }), 'firma.png');
    form.append(
      'payload',
      JSON.stringify({ capturedAt: new Date().toISOString(), strokeCount: 3, mode: 'IN_PERSON' }),
    );
    const firmado = await fetch(`${API}/notes/${id}/signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });
    expect(firmado.status, 'el pagaré queda firmado').toBe(201);

    return { id, cuotas: (emision.body['schedule'] as Calendario).installments };
  }

  it('lo primero que cubre un abono es el interés de la cuota en curso', async () => {
    // $60,000 al 3 % mensual: la primera cuota lleva $1,800 de interés
    // ordinario, y hasta ahí llega el abono antes de tocar el capital.
    const plan = await planFirmado();
    const abono = await abonar(plan.id, '200000');

    expect(abono.status).toBe(201);
    expect(abono.body['appliedToOrdinaryInterestCents']).toBe('180000');
    expect(abono.body['appliedToInterestCents']).toBe('0'); // no hay atraso
    expect(abono.body['appliedToPrincipalCents']).toBe('20000');
  });

  it('no cobra por adelantado el interés de las cuotas que faltan', async () => {
    /*
     * Lo que se rompería con el interés total del plan como pendiente: el
     * primer abono se llevaría el de las doce cuotas y el recibo le diría al
     * deudor que no ha bajado un peso de su deuda (ADR 0022).
     */
    const plan = await planFirmado();
    const abono = await abonar(plan.id, '200000');

    const interesDeLaPrimera = BigInt(plan.cuotas[0]?.interestCents ?? '0');
    expect(BigInt(String(abono.body['appliedToOrdinaryInterestCents']))).toBe(interesDeLaPrimera);
    expect(BigInt(String(abono.body['appliedToPrincipalCents']))).toBeGreaterThan(0n);
  });

  it('los tres conceptos suman exactamente el abono', async () => {
    // Si sobrara o faltara un centavo, el saldo dejaría de cuadrar con el libro.
    const plan = await planFirmado();
    const abono = await abonar(plan.id, '350000');

    const suma =
      BigInt(String(abono.body['appliedToOrdinaryInterestCents'])) +
      BigInt(String(abono.body['appliedToInterestCents'])) +
      BigInt(String(abono.body['appliedToPrincipalCents']));
    expect(suma).toBe(350_000n);
  });

  it('el interés ya cubierto no se vuelve a cobrar', async () => {
    const plan = await planFirmado();
    await abonar(plan.id, '200000');
    const segundo = await abonar(plan.id, '200000');

    // El interés de la primera cuota se pagó con el primer abono, y el segundo
    // no alcanza a entrar en la segunda: todo capital.
    expect(segundo.body['appliedToOrdinaryInterestCents']).toBe('0');
    expect(segundo.body['appliedToPrincipalCents']).toBe('200000');
  });

  it('un abono que cruza a la cuota siguiente cobra también su interés', async () => {
    const plan = await planFirmado();
    const primera = BigInt(plan.cuotas[0]?.amountCents ?? '0');
    const abono = await abonar(plan.id, String(primera + 100_000n));

    const interesDeLasDos =
      BigInt(plan.cuotas[0]?.interestCents ?? '0') + BigInt(plan.cuotas[1]?.interestCents ?? '0');
    // La segunda entra sólo hasta donde llega el abono, y ahí manda el interés.
    expect(BigInt(String(abono.body['appliedToOrdinaryInterestCents']))).toBeGreaterThan(
      BigInt(plan.cuotas[0]?.interestCents ?? '0'),
    );
    expect(BigInt(String(abono.body['appliedToOrdinaryInterestCents']))).toBeLessThanOrEqual(
      interesDeLasDos,
    );
  });

  it('el calendario enseña la cuota saldada y la que va a medias', async () => {
    const plan = await planFirmado();
    const primera = BigInt(plan.cuotas[0]?.amountCents ?? '0');
    await abonar(plan.id, String(primera + 100_000n));

    const detalle = await call(`/admin/notes/${plan.id}`, { token: adminToken });
    const cuotas = (detalle.body['schedule'] as { installments: { status: string }[] }).installments;

    expect(cuotas[0]?.status).toBe('PAID');
    expect(cuotas[1]?.status).toBe('PARTIAL');
    expect(cuotas[2]?.status).toBe('PENDING');
  });

  it('un pagaré de pago único no tiene calendario que enseñar', async () => {
    const suelto = await emitir(1, '1000000');
    const detalle = await call(`/admin/notes/${String(suelto.body['id'])}`, { token: adminToken });

    expect(detalle.body['schedule']).toBeNull();
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
  it('un pagaré a plazos vencido devenga menos que uno suelto del mismo importe', async () => {
    /*
     * Los dos deben lo mismo y llevan la misma tasa; lo único que cambia es que
     * el pagaré a plazos lleva el precio del préstamo dentro. Si la mora fuera
     * igual en los dos, se estaría cobrando interés sobre interés.
     */
    const conPlanEmision = await emitir(12, '6000000', futureDate(-800), {
      model: 'GLOBAL',
      rate: { value: 3, period: 'MONTHLY' },
    });
    expect(conPlanEmision.status).toBe(201);
    const total = (conPlanEmision.body['schedule'] as Calendario).plan.totalCents;

    // El suelto vale lo mismo que el título a plazos y vence el mismo día.
    const detalleConPlan = await call(`/admin/notes/${String(conPlanEmision.body['id'])}`, {
      token: adminToken,
    });
    /*
     * El suelto tiene que vencer **el mismo día** que la última cuota del plan,
     * o los días de atraso serían distintos y la comparación no diría nada. El
     * vencimiento ya no se manda: se expide un mes antes y cae solo.
     */
    const [anio, mes, dia] = String(detalleConPlan.body['dueDate']).split('-').map(Number) as [
      number,
      number,
      number,
    ];
    const unMesAntes = new Date(Date.UTC(anio, mes - 2, dia)).toISOString().slice(0, 10);

    const sueltoEmision = await emitir(1, total, unMesAntes);
    expect(sueltoEmision.status).toBe(201);

    const sinPlan = await call(`/admin/notes/${String(sueltoEmision.body['id'])}`, {
      token: adminToken,
    });

    const mora = (r: typeof sinPlan): bigint =>
      BigInt((r.body['accruedInterest'] as Record<string, string>)['cents'] ?? '0');

    expect(mora(sinPlan)).toBeGreaterThan(0n);
    expect(mora(detalleConPlan)).toBeGreaterThan(0n);
    expect(mora(detalleConPlan)).toBeLessThan(mora(sinPlan));
  });
});

/**
 * La firma es por pagaré (ADR 0021), y ahora es **una** (ADR 0022).
 *
 * El coste que traía la serie —doce cuotas eran doce firmas y doce trazos
 * distintos— desapareció con el pagaré único. Lo que sigue en pie es que la
 * misma imagen no vale para dos títulos distintos.
 */
describe('§8 · una firma, un pagaré', () => {
  it('firmar el pagaré a plazos es un solo acto', async () => {
    const emision = await emitir(12, '6000000', undefined, {
      model: 'INSOLUTOS',
      rate: { value: 3, period: 'MONTHLY' },
    });
    const id = String(emision.body['id']);

    const trazo = await trazoUnico();
    const form = new FormData();
    form.append('signature', new Blob([new Uint8Array(trazo)], { type: 'image/png' }), 'firma.png');
    form.append(
      'payload',
      JSON.stringify({ capturedAt: new Date().toISOString(), strokeCount: 3, mode: 'IN_PERSON' }),
    );
    const firmado = await fetch(`${API}/notes/${id}/signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });

    expect(firmado.status).toBe(201);
  });

  it('reenviar el mismo trazo a otro pagaré es 409', async () => {
    const primero = await emitir(2, '900000');
    const segundo = await emitir(1, '900000');
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

    expect((await firmar(String(primero.body['id']))).status).toBe(201);

    // Nadie dibuja dos veces exactamente lo mismo: si el hash coincide, es que
    // se reenvió el trazo anterior.
    const repetida = await firmar(String(segundo.body['id']));
    expect(repetida.status).toBe(409);
    const problema = (await repetida.json()) as Record<string, unknown>;
    expect(String(problema['type'])).toContain('signature_reused');
    // El folio donde ya se usó va en el mensaje: es lo que permite entenderlo.
    expect(String(problema['title'])).toContain(String(primero.body['folio']));
  });
});
