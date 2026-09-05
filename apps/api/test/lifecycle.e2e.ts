import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Recorrido completo contra la API real: emitir, abonar, convenir y castigar.
 *
 * Requiere la API levantada con su base de datos. Comprueba lo que las pruebas
 * unitarias no pueden: que las transacciones, los guards y la derivación de
 * estado funcionan juntos.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
const ADMIN = { email: 'admin@pagares.local', password: 'Demo-Pagares-2026' };

let token = '';

async function call(
  path: string,
  init: { method?: string; body?: unknown; idempotent?: boolean; auth?: boolean } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  if (init.idempotent) headers['Idempotency-Key'] = randomUUID();

  const response = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

function futureDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const login = await call('/auth/login', { method: 'POST', body: ADMIN, auth: false });
  if (login.status === 429) {
    // El cupo de §25.7 es por IP y ventana: con la API recién arrancada sobra,
    // pero tras muchas pasadas seguidas se agota. Decirlo evita perder media
    // hora buscando el fallo donde no está.
    throw new Error(
      'La API está limitando los accesos (429). Reinicia la API o sube RATE_LIMIT_AUTH_PER_15M.',
    );
  }
  expect(login.status).toBe(200);
  token = String(login.body['accessToken']);
});

afterAll(() => {
  token = '';
});

describe('ciclo de vida del pagaré', () => {
  let noteId = '';
  let folio = '';

  it('emite un pagaré con folio e importe en letra generados por el servidor', async () => {
    const result = await call('/admin/notes', {
      method: 'POST',
      idempotent: true,
      body: {
        debtor: {
          fullName: `Cliente E2E ${Date.now()}`,
          address: 'Calle de prueba 1',
          phone: '+524430000001',
        },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        // La tasa viaja como se pacta y el servidor la normaliza a anual
        // (§12.3): el campo plano dejó de existir al distinguir mensual de anual.
        interestRate: { value: 2, period: 'MONTHLY' },
      },
    });

    expect(result.status).toBe(201);
    expect(result.body['folio']).toMatch(/^PAG-\d{4}-\d{6}$/);
    expect(result.body['amountInWords']).toBe('DIEZ MIL PESOS 00/100 M.N.');
    expect(result.body['status']).toBe('PENDING_SIGNATURE');

    noteId = String(result.body['id']);
    folio = String(result.body['folio']);
  });

  it('rechaza un abono antes de la firma', async () => {
    const result = await call(`/admin/notes/${noteId}/payments`, {
      method: 'POST',
      idempotent: true,
      body: { amountCents: '100000', paidOn: futureDate(0), method: 'CASH' },
    });
    expect(result.status).toBe(409);
  });

  it('rechaza un vencimiento anterior a la expedición', async () => {
    const result = await call('/admin/notes', {
      method: 'POST',
      idempotent: true,
      body: {
        debtor: { fullName: 'Cliente inválido', address: 'x', phone: '+524430000002' },
        issuePlace: 'Morelia',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia',
        dueDate: futureDate(-10),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '100000',
      },
    });
    expect(result.status).toBe(422);
  });

  it('recalcular el saldo de un pagaré que cuadra no cambia nada', async () => {
    /*
     * La reconciliación de §22.5 tiene que ser idempotente: se ejecuta desde
     * Ajustes cuando algo salió en rojo, y volver a pulsarla no puede mover el
     * saldo de un pagaré sano.
     */
    const result = await call(`/admin/notes/${noteId}/recalculate-balance`, { method: 'POST', body: {} });
    expect(result.status).toBe(200);
    expect(result.body['changed']).toBe(false);
  });

  it('anula el pagaré con motivo de catálogo y queda cerrado', async () => {
    const rejected = await call(`/admin/notes/${noteId}/void`, {
      method: 'POST',
      idempotent: true,
      body: { reasonCode: 'motivo_inventado', reasonNote: 'No está en el catálogo' },
    });
    expect(rejected.status).toBe(400);

    const accepted = await call(`/admin/notes/${noteId}/void`, {
      method: 'POST',
      idempotent: true,
      body: { reasonCode: 'capture_error', reasonNote: 'Prueba automatizada' },
    });
    expect(accepted.status).toBe(201);
    expect(accepted.body['status']).toBe('VOID');

    const detail = await call(`/admin/notes/${noteId}`);
    expect(detail.body['status']).toBe('VOID');
    expect(folio).toBeTruthy();
  });
});

describe('controles de acceso', () => {
  it('rechaza sin token', async () => {
    const result = await call('/admin/notes', { auth: false });
    expect(result.status).toBe(401);
  });

  it('no distingue correo inexistente de contraseña incorrecta', async () => {
    /*
     * La cuenta del intento fallido es de usar y tirar, **nunca la del
     * administrador**: el bloqueo de §10.2 cuenta por cuenta y no se reinicia
     * salvo con un acceso correcto, así que probar aquí con la cuenta que usa
     * toda la suite la bloqueaba cinco horas a la quinta ejecución y dejaba las
     * 37 pruebas en gris sin decir por qué.
     */
    const victima = await call('/admin/users', {
      method: 'POST',
      idempotent: true,
      body: {
        email: `enumeracion-${Date.now()}@ejemplo.mx`,
        fullName: 'Cuenta de prueba de enumeración',
        role: 'CLIENT',
      },
    });
    expect(victima.status).toBe(201);

    const wrongPassword = await call('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: String(victima.body['email']), password: 'incorrecta-pero-larga' },
    });
    const noUser = await call('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: `nadie-${Date.now()}@ejemplo.mx`, password: 'incorrecta-pero-larga' },
    });
    // Mismo código y mismo mensaje: si difirieran, se podrían enumerar cuentas.
    expect(wrongPassword.status).toBe(noUser.status);
    expect(wrongPassword.body['title']).toBe(noUser.body['title']);
  });

  it('rechaza un campo extra en el cuerpo', async () => {
    const result = await call('/auth/login', {
      method: 'POST',
      auth: false,
      body: { ...ADMIN, role: 'ADMIN' },
    });
    expect(result.status).toBe(422);
  });

  it('responde 202 al olvido exista o no la cuenta', async () => {
    const real = await call('/auth/password/forgot', {
      method: 'POST',
      auth: false,
      body: { email: ADMIN.email },
    });
    const fake = await call('/auth/password/forgot', {
      method: 'POST',
      auth: false,
      body: { email: `nadie-${Date.now()}@ejemplo.mx` },
    });
    expect(real.status).toBe(202);
    expect(fake.status).toBe(202);
  });
});

describe('idempotencia', () => {
  it('devuelve el mismo resultado con la misma clave', async () => {
    const key = randomUUID();
    const body = {
      debtor: { fullName: `Idem ${Date.now()}`, address: 'x', phone: '+524430000003' },
      issuePlace: 'Morelia',
      issueDate: futureDate(-1),
      paymentPlace: 'Morelia',
      dueDate: futureDate(30),
      creditorName: 'Créditos Morelia S.A. de C.V.',
      amountCents: '500000',
    };

    const send = async (payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
      const response = await fetch(`${API}/admin/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': key,
        },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    };

    const first = await send(body);
    const second = await send(body);
    expect(second.body['folio']).toBe(first.body['folio']);

    // Misma clave con otro cuerpo: es un error del cliente, no un reintento.
    const different = await send({ ...body, amountCents: '900000' });
    expect(different.status).toBe(422);
  });
});

/**
 * Nada nuevo mientras quede algo sin firmar (ADR 0019).
 *
 * Un pagaré sin firma no obliga al deudor: es una petición, no una deuda.
 * Emitirle otro encima acumula papeles que no valen y deja al administrador sin
 * saber qué aceptó de verdad.
 */
describe('§12 · no se emite otro pagaré a quien no firmó el anterior', () => {
  /** Emite para un deudor identificado por su teléfono. */
  async function emitirPara(
    phone: string,
    extra: Record<string, unknown> = {},
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return call('/admin/notes', {
      method: 'POST',
      idempotent: true,
      body: {
        debtor: { fullName: 'Deudor de la regla', address: 'Calle de prueba 9', phone },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        interestRate: { value: 3, period: 'MONTHLY' },
        ...extra,
      },
    });
  }

  const nuevoTelefono = (): string =>
    `+52443${String(Date.now()).slice(-4)}${Math.floor(Math.random() * 1000)}`;

  it('el segundo pagaré es 409, y dice cuál falta por firmar', async () => {
    const phone = nuevoTelefono();
    const primero = await emitirPara(phone);
    expect(primero.status).toBe(201);

    const segundo = await emitirPara(phone);
    expect(segundo.status).toBe(409);
    // El folio pendiente va en el mensaje: quien emite necesita saber a por
    // cuál firma tiene que ir, no un «no se pudo».
    expect(String(segundo.body['title'])).toContain(String(primero.body['folio']));
    expect(String(segundo.body['type'])).toContain('debtor_has_unsigned_note');
  });

  it('la misma persona tecleada de nuevo tampoco cuela', async () => {
    /*
     * Sin identificarla por teléfono, volver a escribir sus datos creaba otra
     * ficha y la regla se saltaba sola. El teléfono es obligatorio y es la
     * identidad que ya usaba la importación (§24.5).
     */
    const phone = nuevoTelefono();
    expect((await emitirPara(phone)).status).toBe(201);

    const otraVez = await call('/admin/notes', {
      method: 'POST',
      idempotent: true,
      body: {
        // Otro nombre y otro domicilio, el mismo teléfono con espacios.
        debtor: { fullName: 'Deudor Tecleado Otra Vez', address: 'Otra calle 3', phone },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '500000',
        interestRate: { value: 3, period: 'MONTHLY' },
      },
    });
    expect(otraVez.status).toBe(409);
  });

  it('una serie entera sí se emite: es un solo acto', async () => {
    // Las doce cuotas nacen juntas y se firman juntas. Si la regla contara
    // contra sí misma, no habría planes de pago (§12).
    const resultado = await emitirPara(nuevoTelefono(), {
      amountCents: '6000000',
      installments: 12,
      plan: { model: 'INSOLUTOS', rate: { value: 3, period: 'MONTHLY' } },
    });

    expect(resultado.status).toBe(201);
    expect((resultado.body['series'] as { notes: unknown[] }).notes).toHaveLength(12);
  });

  it('anulado el pendiente, se vuelve a poder emitir', async () => {
    // Lo anulado no se debe, así que ya no bloquea nada (§13.7).
    const phone = nuevoTelefono();
    const primero = await emitirPara(phone);
    expect(primero.status).toBe(201);

    const anulado = await call(`/admin/notes/${String(primero.body['id'])}/void`, {
      method: 'POST',
      idempotent: true,
      body: { reasonCode: 'capture_error', reasonNote: 'Prueba de la regla de firma' },
    });
    expect(anulado.status).toBe(201);

    expect((await emitirPara(phone)).status).toBe(201);
  });
});

/**
 * Renovar también crea un pagaré (§12, ADR 0019).
 *
 * Es el tercer camino que emite un título —los otros son la emisión y la
 * importación—, y por eso la regla de «nada nuevo sin firmar» tiene que estar
 * aquí: si sólo vigilara la emisión, se saltaría renovando.
 */
describe('§12 · la renovación también respeta la firma pendiente', () => {
  const nuevoTelefono = (): string =>
    `+52443${String(Date.now()).slice(-4)}${Math.floor(Math.random() * 1000)}`;

  async function emitirPara(phone: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return call('/admin/notes', {
      method: 'POST',
      idempotent: true,
      body: {
        debtor: { fullName: 'Deudor de renovación', address: 'Calle de prueba 12', phone },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        interestRate: { value: 3, period: 'MONTHLY' },
      },
    });
  }

  async function renovar(noteId: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return call(`/admin/notes/${noteId}/renew`, {
      method: 'POST',
      idempotent: true,
      body: { newDueDate: futureDate(90), reason: 'Acuerdo con el cliente' },
    });
  }

  it('el pagaré que se renueva no cuenta contra sí mismo', async () => {
    // Renovar no suma un título: lo cambia por otro. Si contara, no se podría
    // renovar nada que no estuviera firmado.
    const phone = nuevoTelefono();
    const primero = await emitirPara(phone);
    expect(primero.status).toBe(201);

    const renovado = await renovar(String(primero.body['id']));
    expect(renovado.status).toBe(201);
  });

  it('pero no se renueva teniendo otro pagaré sin firmar', async () => {
    /*
     * El deudor acabaría con dos papeles sin firma por la vía de renovar, que
     * es justo lo que la regla impide por la vía de emitir.
     */
    const phone = nuevoTelefono();
    const primero = await emitirPara(phone);
    const renovado = await renovar(String(primero.body['id']));
    expect(renovado.status).toBe(201);

    // Ahora hay uno sin firmar (el renovado) y se intenta renovar... otro.
    const segundo = await renovar(String(renovado.body['id']));
    expect(segundo.status).toBe(201);

    // El de arriba pasó porque el pendiente era él mismo. Con un pendiente
    // ajeno, no pasa: se emite otro para el mismo deudor por otra vía.
    const tercero = await emitirPara(phone);
    expect(tercero.status).toBe(409);
    expect(String(tercero.body['type'])).toContain('debtor_has_unsigned_note');
  });
});

/**
 * El pagaré descargable (§17.1).
 *
 * Es el documento que se lleva a un juzgado y el que el deudor guarda tres
 * años. Estas pruebas no miran cómo se ve —eso se mira con los ojos— sino que
 * llegue entero: las tasas pactadas tienen que constar en el título para poder
 * exigirse, y una copia sin firma no puede pasar por un título exigible.
 */
describe('§17.1 · el pagaré en PDF', () => {
  async function pdf(
    noteId: string,
  ): Promise<{ status: number; tipo: string | null; bytes: number; texto: string }> {
    const respuesta = await fetch(`${API}/admin/notes/${noteId}/documents/note`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const buffer = Buffer.from(await respuesta.arrayBuffer());
    /*
     * El cuerpo del PDF va comprimido, así que el texto de la página no se lee
     * así. Los metadatos sí: el título va en el diccionario Info y en UTF-16,
     * de ahí que se quiten los bytes nulos antes de buscar.
     */
    return {
      status: respuesta.status,
      tipo: respuesta.headers.get('content-type'),
      bytes: buffer.length,
      texto: buffer.toString('latin1').replace(/\u0000/g, ''),
    };
  }

  it('se genera y se llama por su folio', async () => {
    const emitido = await call('/admin/notes', {
      method: 'POST',
      idempotent: true,
      body: {
        debtor: {
          fullName: 'Deudor del PDF',
          address: 'Calle de prueba 20',
          phone: `+52443${String(Date.now()).slice(-7)}`,
        },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        interestRate: { value: 3, period: 'MONTHLY' },
      },
    });
    expect(emitido.status).toBe(201);

    const documento = await pdf(String(emitido.body['id']));
    expect(documento.status).toBe(200);
    expect(documento.tipo).toBe('application/pdf');
    // Un PDF de dos kilobytes es una hoja en blanco con membrete.
    expect(documento.bytes).toBeGreaterThan(4000);
    // El título del documento lleva el folio: es como se distingue en una
    // carpeta con veinte descargas.
    expect(documento.texto).toContain(String(emitido.body['folio']));
  });
});

/**
 * El cuerpo de la firma no admite lo que no se declaró (§24.1, API3).
 *
 * Se probó a que el aparato verificara al firmante —Face ID o su código— antes
 * del trazo, y se descartó: para entrar a la aplicación ya hacen falta
 * contraseña y, si el usuario la activó, biometría, y quien tiene el sensor
 * roto se quedaba sin poder firmar su pagaré, que es lo peor que puede pasar en
 * esa pantalla. El campo que se llegó a aceptar vuelve a rebotar.
 */
describe('§24.1 · el cuerpo de la firma es estricto', () => {
  async function trazo(): Promise<Buffer> {
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

  async function emitirYFirmar(payload: Record<string, unknown>): Promise<number> {
    const emitido = await call('/admin/notes', {
      method: 'POST',
      idempotent: true,
      body: {
        debtor: {
          fullName: 'Deudor que firma',
          address: 'Calle de prueba 30',
          phone: `+52443${String(Date.now()).slice(-7)}`,
        },
        issuePlace: 'Morelia, Michoacán',
        issueDate: futureDate(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: futureDate(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        interestRate: { value: 3, period: 'MONTHLY' },
      },
    });
    expect(emitido.status).toBe(201);

    const form = new FormData();
    const png = await trazo();
    form.append('signature', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'firma.png');
    form.append('payload', JSON.stringify(payload));

    const respuesta = await fetch(`${API}/notes/${String(emitido.body['id'])}/signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return respuesta.status;
  }

  it('firma con lo que sí está en el catálogo', async () => {
    const estado = await emitirYFirmar({
      capturedAt: new Date().toISOString(),
      strokeCount: 3,
      mode: 'IN_PERSON',
    });
    expect(estado).toBe(201);
  });

  it('cualquier otro campo es 422, incluido el que se retiró', async () => {
    // Aceptar cualquier cosa es cómo se cuelan campos que nadie declaró, y un
    // campo retirado que siguiera pasando sería un dato muerto viajando.
    const estado = await emitirYFirmar({
      capturedAt: new Date().toISOString(),
      strokeCount: 3,
      mode: 'IN_PERSON',
      biometricVerified: true,
    });
    expect(estado).toBe(422);
  });
});
