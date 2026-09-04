import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Contrato de las rutas del deudor (§15, `/me/*`).
 *
 * Existe por un defecto concreto: los importes salían sólo como texto ya
 * formateado —"$45,000.00 MXN"—, así que la aplicación podía enseñarlos pero no
 * sumarlos. Quien los recibía tenía que deshacer el formato para calcular, que
 * es un error de céntimos esperando a ocurrir.
 *
 * Estas pruebas fijan que **todo** el dinero de estas rutas viaja como el objeto
 * de §12.1 —número, moneda y texto—, y que es el mismo objeto en las cuatro.
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

/**
 * Comprueba la forma del dinero: el número para calcular, el texto para leer.
 *
 * El número va como cadena porque un pagaré grande no cabe en el entero seguro
 * de JavaScript, y va sin puntos ni comas para que se pueda convertir sin
 * limpiarlo antes.
 */
function esDinero(valor: unknown, donde: string): void {
  expect(valor, `${donde}: falta el importe`).toBeTypeOf('object');
  const dinero = valor as Record<string, unknown>;
  expect(Object.keys(dinero).sort(), `${donde}: campos`).toEqual([
    'cents',
    'currency',
    'formatted',
  ]);
  expect(dinero['cents'], `${donde}: los centavos van como cadena`).toBeTypeOf('string');
  expect(String(dinero['cents']), `${donde}: centavos sin formato`).toMatch(/^-?\d+$/);
  expect(dinero['currency'], `${donde}: moneda`).toBe('MXN');
  expect(String(dinero['formatted']), `${donde}: texto legible`).toMatch(/^-?\$[\d,]+\.\d{2} MXN$/);
}

let adminToken = '';
let clienteToken = '';
let noteId = '';
let paymentId = '';

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN });
  if (login.status === 429) {
    throw new Error('La API está limitando los accesos (429). Reinicia la API.');
  }
  expect(login.status).toBe(200);
  adminToken = String(login.body['accessToken']);

  const sufijo = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const email = `contrato-${sufijo}@ejemplo.mx`;
  const phone = `+52443${String(Date.now()).slice(-7)}`;

  const creado = await call('/admin/users', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: { email, fullName: 'Cliente de contrato', role: 'CLIENT' },
  });
  expect(creado.status).toBe(201);

  const reto = await call('/auth/login', {
    method: 'POST',
    body: { email, password: String(creado.body['temporaryPassword']) },
  });
  const sesion = await call('/auth/password/change-initial', {
    method: 'POST',
    body: {
      changeToken: String(reto.body['changeToken']),
      newPassword: `Contrato-${sufijo}-2026!`,
    },
  });
  expect(sesion.status).toBe(200);
  clienteToken = String(sesion.body['accessToken']);

  // Un pagaré a su nombre: el alta del deudor sale de aquí.
  const emitido = await call('/admin/notes', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: {
      debtor: { fullName: 'Cliente de contrato', address: 'Calle de prueba 1', phone, email },
      issuePlace: 'Morelia, Michoacán',
      issueDate: futureDate(-2),
      paymentPlace: 'Morelia, Michoacán',
      dueDate: futureDate(30),
      creditorName: 'Créditos Morelia S.A. de C.V.',
      amountCents: '1000000',
      interestRate: { value: 2, period: 'MONTHLY' },
    },
  });
  expect(emitido.status).toBe(201);

  /*
   * Para que haya abonos hace falta un pagaré firmado, y firmar exige subir un
   * trazo. La importación (§24.5) entra como firmada en papel, que es la vía
   * corta y además cubre el camino del deudor con cartera vieja.
   */
  const csv = [
    'telefono_deudor,importe,fecha_emision,vencimiento,abonado',
    `${phone},10000.00,${futureDate(-40)},${futureDate(60)},0`,
  ].join('\n');
  const importado = await call('/admin/imports/notes', {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: { csv, commit: true },
  });
  expect(importado.status).toBe(200);

  const suyos = await call('/me/notes', { token: clienteToken });
  expect(suyos.status).toBe(200);
  const filas = suyos.body as unknown as Record<string, unknown>[];
  const firmado = filas.find((fila) => fila['status'] !== 'PENDING_SIGNATURE');
  expect(firmado, 'el pagaré importado es suyo y está firmado en papel').toBeTruthy();
  noteId = String(firmado?.['id']);

  const abono = await call(`/admin/notes/${noteId}/payments`, {
    method: 'POST',
    token: adminToken,
    idempotencyKey: randomUUID(),
    body: { amountCents: '250000', paidOn: futureDate(0), method: 'TRANSFER' },
  });
  expect(abono.status).toBe(201);
  paymentId = String(abono.body['paymentId']);
});

describe('§12.1 · el dinero del deudor se puede leer y calcular', () => {
  it('el resumen trae el saldo completo, con moneda', () => {
    // Sin `currency`, la aplicación tenía que asumir pesos por su cuenta.
    return call('/me/summary', { token: clienteToken }).then((resumen) => {
      expect(resumen.status).toBe(200);
      esDinero(resumen.body['totalBalance'], 'summary.totalBalance');
      expect(resumen.body['activeNotes']).toBeTypeOf('number');
      expect(resumen.body['pendingSignature']).toBeTypeOf('number');
    });
  });

  it('el listado trae importe, abonado y saldo', async () => {
    const listado = await call('/me/notes', { token: clienteToken });
    expect(listado.status).toBe(200);

    const filas = listado.body as unknown as Record<string, unknown>[];
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      esDinero(fila['amount'], 'notes[].amount');
      // `paid` faltaba en el listado: sin él no se puede pintar el avance de un
      // pagaré sin abrir su detalle.
      esDinero(fila['paid'], 'notes[].paid');
      esDinero(fila['balance'], 'notes[].balance');
    }
  });

  it('el detalle trae los cuatro importes, interés corrido incluido', async () => {
    const detalle = await call(`/me/notes/${noteId}`, { token: clienteToken });
    expect(detalle.status).toBe(200);

    esDinero(detalle.body['amount'], 'detalle.amount');
    esDinero(detalle.body['paid'], 'detalle.paid');
    esDinero(detalle.body['balance'], 'detalle.balance');
    // El interés es el que hace falta para decir "cuánto pago hoy": sin número,
    // no se puede sumar al saldo.
    esDinero(detalle.body['accruedInterest'], 'detalle.accruedInterest');
  });

  it('el saldo del detalle cuadra con el importe menos lo abonado', async () => {
    const detalle = await call(`/me/notes/${noteId}`, { token: clienteToken });
    const centavos = (campo: string): bigint =>
      BigInt(String((detalle.body[campo] as Record<string, unknown>)['cents']));

    expect(centavos('amount') - centavos('paid')).toBe(centavos('balance'));
    expect(centavos('paid')).toBe(250_000n);
  });

  it('cada abono del libro trae importe y reparto entre interés y capital', async () => {
    const abonos = await call(`/me/notes/${noteId}/payments`, { token: clienteToken });
    expect(abonos.status).toBe(200);

    const filas = abonos.body as unknown as Record<string, unknown>[];
    expect(filas.length).toBeGreaterThan(0);
    for (const fila of filas) {
      esDinero(fila['amount'], 'payments[].amount');
      esDinero(fila['appliedToInterest'], 'payments[].appliedToInterest');
      esDinero(fila['appliedToPrincipal'], 'payments[].appliedToPrincipal');
      expect(fila['isReversal']).toBeTypeOf('boolean');
      expect(fila['isRecovery']).toBeTypeOf('boolean');
      expect(fila['isWaiver']).toBeTypeOf('boolean');
    }
  });

  it('el reparto de cada abono suma exactamente su importe', async () => {
    // Si interés más capital no da el abono, el deudor ve dinero que no aparece
    // en ninguna de las dos columnas (§12.3).
    const abonos = await call(`/me/notes/${noteId}/payments`, { token: clienteToken });
    const filas = abonos.body as unknown as Record<string, Record<string, string>>[];

    for (const fila of filas) {
      const total = BigInt(fila['amount']!['cents']!);
      const interes = BigInt(fila['appliedToInterest']!['cents']!);
      const capital = BigInt(fila['appliedToPrincipal']!['cents']!);
      expect(interes + capital).toBe(total);
    }
  });

  it('los abonos embebidos en el detalle traen su identificador', async () => {
    // El recibo se pide por abono: sin `id`, el detalle enseñaba una lista de la
    // que no se podía descargar nada.
    const detalle = await call(`/me/notes/${noteId}`, { token: clienteToken });
    const abonos = detalle.body['payments'] as Record<string, unknown>[];

    expect(abonos.length).toBeGreaterThan(0);
    for (const abono of abonos) {
      expect(String(abono['id'])).toMatch(/^[0-9a-f-]{36}$/);
      esDinero(abono['amount'], 'detalle.payments[].amount');
    }
  });
});

describe('§25.2 · sus propios datos', () => {
  it('trae el domicilio y el teléfono que registró el acreedor', async () => {
    // Los tiene delante en el pagaré impreso: ocultárselos en la aplicación no
    // protege nada y le impide comprobar que están bien escritos.
    const perfil = await call('/me/profile', { token: clienteToken });

    expect(perfil.status).toBe(200);
    expect(perfil.body['fullName']).toBe('Cliente de contrato');
    expect(String(perfil.body['address']).length).toBeGreaterThan(0);
    expect(String(perfil.body['phone'])).toMatch(/^\+52/);
    expect(perfil.body['registeredByCreditor']).toBe(true);
  });

  it('sin sesión no responde', async () => {
    expect((await call('/me/profile')).status).toBe(401);
  });
});

describe('§13 · la bitácora trae el importe como dato, no dentro de la frase', () => {
  it('los movimientos con dinero lo traen en centavos', async () => {
    /*
     * Sacarlo de `detail` con una expresión regular es un acuerdo que se rompe
     * en cuanto alguien mejora la redacción del texto.
     */
    const actividad = await call('/me/activity', { token: clienteToken });
    expect(actividad.status).toBe(200);

    const eventos = actividad.body as unknown as Record<string, unknown>[];
    expect(eventos.length).toBeGreaterThan(0);

    for (const evento of eventos) {
      expect(Object.keys(evento), 'el campo existe siempre').toContain('amount');
      if (evento['kind'] === 'note-signed') {
        // Firmar no mueve dinero.
        expect(evento['amount']).toBeNull();
      } else {
        esDinero(evento['amount'], `activity.${String(evento['kind'])}`);
      }
    }
  });

  it('el abono de la bitácora coincide con el del libro', async () => {
    const [actividad, abonos] = await Promise.all([
      call('/me/activity', { token: clienteToken }),
      call(`/me/notes/${noteId}/payments`, { token: clienteToken }),
    ]);

    const registrado = (actividad.body as unknown as Record<string, unknown>[]).find(
      (evento) => evento['kind'] === 'payment-registered',
    );
    const primerAbono = (abonos.body as unknown as Record<string, Record<string, string>>[])[0];

    expect((registrado?.['amount'] as Record<string, string>)['cents']).toBe(
      primerAbono?.['amount']?.['cents'],
    );
  });
});

describe('§25.15 · quién más quedó obligado', () => {
  it('el detalle lista al aval por su nombre', async () => {
    // Firmar sin ver quién más queda obligado es firmar a medias.
    const detalle = await call(`/me/notes/${noteId}`, { token: clienteToken });
    expect(Array.isArray(detalle.body['guarantors'])).toBe(true);

    for (const aval of detalle.body['guarantors'] as Record<string, unknown>[]) {
      expect(aval['fullName']).toBeTypeOf('string');
      /*
       * Sin estado de firma, a propósito: el sistema no puede capturar la del
       * aval, y un «pendiente de firma» que nunca cambia prometía un paso que
       * no existe.
       */
      expect(Object.keys(aval)).not.toContain('signedAt');
      // Del tercero, lo justo: su domicilio y su teléfono están en el papel y
      // no hacen falta aquí (§9.1).
      expect(Object.keys(aval)).not.toContain('phone');
      expect(Object.keys(aval)).not.toContain('address');
    }
  });
});

describe('§17.1 · los documentos del deudor', () => {
  it('sirve su pagaré en PDF', async () => {
    const respuesta = await fetch(`${API}/me/notes/${noteId}/documents/note`, {
      headers: { Authorization: `Bearer ${clienteToken}` },
    });
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toBe('application/pdf');
  });

  it('sirve el recibo del abono que se le indica', async () => {
    const respuesta = await fetch(
      `${API}/me/notes/${noteId}/documents/receipt?paymentId=${paymentId}`,
      { headers: { Authorization: `Bearer ${clienteToken}` } },
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toBe('application/pdf');
  });

  it('el finiquito de un pagaré vivo no existe', async () => {
    // Certificar que no se debe nada cuando sí se debe sería una falsedad.
    const respuesta = await fetch(`${API}/me/notes/${noteId}/documents/release`, {
      headers: { Authorization: `Bearer ${clienteToken}` },
    });
    expect(respuesta.status).toBe(404);
  });

  it('un tipo de documento inventado es 400, no un PDF cualquiera', async () => {
    const respuesta = await fetch(`${API}/me/notes/${noteId}/documents/loquesea`, {
      headers: { Authorization: `Bearer ${clienteToken}` },
    });
    expect(respuesta.status).toBe(400);
  });
});

/**
 * El plan de pagos que ve el deudor (§12).
 *
 * Regla del negocio: **el plan es por folio y sólo con el folio firmado**. Lo
 * que todavía no ha firmado no es deuda suya, así que agruparlo dentro del plan
 * sería enseñarle como aceptado algo que aún puede rechazar, y sumarle un saldo
 * que no debe. Una serie a medio firmar se ve partida a propósito.
 */
describe('§12 · el plan sólo con el folio firmado', () => {
  let cuotas: Record<string, unknown>[] = [];
  let primera = '';

  beforeAll(async () => {
    const perfil = await call('/me/profile', { token: clienteToken });
    const phone = String((perfil.body as Record<string, unknown>)['phone']);
    const email = String((perfil.body as Record<string, unknown>)['email']);

    const emitido = await call('/admin/notes', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: {
        debtor: { fullName: 'Cliente de contrato', address: 'Calle de prueba 1', phone, email },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-2),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '6000000',
        interestRate: { value: 3, period: 'MONTHLY' },
        installments: 3,
        plan: { model: 'INSOLUTOS', rate: { value: 3, period: 'MONTHLY' } },
      },
    });
    expect(emitido.status).toBe(201);
    cuotas = (emitido.body['series'] as { notes: Record<string, unknown>[] }).notes;
    primera = String(cuotas[0]?.['id']);

    // Firma sólo la primera: es el caso que importa, la serie a medio firmar.
    const sharp = (await import('sharp')).default;
    const trazo = await sharp({
      create: { width: 400, height: 160, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const form = new FormData();
    form.append('signature', new Blob([new Uint8Array(trazo)], { type: 'image/png' }), 'firma.png');
    form.append(
      'payload',
      JSON.stringify({ capturedAt: new Date().toISOString(), strokeCount: 3, mode: 'REMOTE' }),
    );

    const firmado = await fetch(`${API}/notes/${primera}/signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clienteToken}` },
      body: form,
    });
    expect(firmado.status, 'la primera cuota queda firmada').toBe(201);
  });

  it('la cuota firmada trae el plan, con el tamaño pactado', async () => {
    const suyos = await call('/me/notes', { token: clienteToken });
    const fila = (suyos.body as unknown as Record<string, unknown>[]).find(
      (n) => n['id'] === primera,
    );
    const plan = fila?.['plan'] as Record<string, unknown>;

    expect(plan, 'la cuota firmada trae plan').toBeTruthy();
    // Tres cuotas pactadas, una firmada: la app puede decir «1 de 3 firmados»
    // en vez de fingir que el plan tiene una sola cuota.
    expect(plan['size']).toBe(3);
    expect(plan['signedCount']).toBe(1);
    expect(plan['paidCount']).toBe(0);
    expect(plan['model']).toBe('INSOLUTOS');
    esDinero(plan['total'], 'plan.total');
    esDinero(plan['paid'], 'plan.paid');
    esDinero(plan['pending'], 'plan.pending');
  });

  it('el total del plan es el de lo firmado, no el de la deuda entera', async () => {
    // Sumar las tres cuotas le enseñaría un saldo que todavía no aceptó.
    const suyos = await call('/me/notes', { token: clienteToken });
    const fila = (suyos.body as unknown as Record<string, unknown>[]).find(
      (n) => n['id'] === primera,
    );
    const plan = fila?.['plan'] as Record<string, Record<string, string>>;
    const importe = (fila?.['amount'] as Record<string, string>)['cents'];

    expect(plan['total']?.['cents']).toBe(importe);
    expect(plan['pending']?.['cents']).toBe(importe);
  });

  it('las cuotas sin firmar son folios sueltos, sin plan', async () => {
    const suyos = await call('/me/notes', { token: clienteToken });
    const filas = suyos.body as unknown as Record<string, unknown>[];

    for (const cuota of cuotas.slice(1)) {
      const fila = filas.find((n) => n['id'] === cuota['id']);
      expect(fila?.['plan'], 'sin firma no hay plan').toBeNull();
      // Pero siguen sabiendo de qué serie son: es «Pago 2 de 3» pendiente de firma.
      expect(fila?.['installment']).toBeTruthy();
    }
  });

  it('el detalle de la cuota firmada trae el mismo plan', async () => {
    const detalle = await call(`/me/notes/${primera}`, { token: clienteToken });
    const plan = detalle.body['plan'] as Record<string, unknown>;

    expect(plan['signedCount']).toBe(1);
    expect(plan['size']).toBe(3);
  });

  it('liquidar por anticipado contesta sólo por lo firmado', async () => {
    /*
     * La pregunta que hoy sólo se contesta llamando al prestamista. Con una
     * cuota firmada de tres, la cifra es la de esa cuota: cobrarle las otras dos
     * sería cobrarle por lo que aún no aceptó (ADR 0017).
     */
    const respuesta = await call(`/me/notes/${primera}/early-payoff`, { token: clienteToken });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body['pendingCount']).toBe(1);
    expect(respuesta.body['planModel']).toBe('INSOLUTOS');

    const suyos = await call('/me/notes', { token: clienteToken });
    const fila = (suyos.body as unknown as Record<string, unknown>[]).find(
      (n) => n['id'] === primera,
    );
    const saldo = BigInt((fila?.['balance'] as Record<string, string>)['cents'] ?? '0');
    const ahorro = BigInt((respuesta.body['saved'] as Record<string, string>)['cents'] ?? '0');
    const total = BigInt((respuesta.body['total'] as Record<string, string>)['cents'] ?? '0');

    /*
     * Sobre saldos insolutos, la cuota que aún no vence no cobra su interés: el
     * tiempo que no transcurre no se causa. Así que paga el capital y se ahorra
     * exactamente el interés que llevaba dentro.
     */
    expect(ahorro).toBeGreaterThan(0n);
    expect(total + ahorro).toBe(saldo);
  });

  it('el pagaré de otro no se liquida', async () => {
    // BOLA: el filtro por dueño va en la consulta, y responde 404 para no
    // confirmar siquiera que el pagaré existe (§9.1, API1).
    const ajeno = await call('/admin/notes', {
      method: 'POST',
      token: adminToken,
      idempotencyKey: randomUUID(),
      body: {
        debtor: {
          fullName: 'Otro deudor',
          address: 'Calle ajena 2',
          phone: `+52443${String(Date.now()).slice(-7)}`,
        },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-2),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        interestRate: { value: 2, period: 'MONTHLY' },
      },
    });

    const respuesta = await call(`/me/notes/${String(ajeno.body['id'])}/early-payoff`, {
      token: clienteToken,
    });
    expect(respuesta.status).toBe(404);
  });
});
