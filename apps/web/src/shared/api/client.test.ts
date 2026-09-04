import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readSession = vi.fn();
vi.mock('../auth/session', () => ({ readSession }));

const { api, ApiError } = await import('./client');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const problem = {
  type: 'https://api.pagares.mx/errors/payment_exceeds_balance',
  title: 'El abono supera el saldo pendiente de 250.00',
  status: 422,
  traceId: 'abc',
  errors: [{ field: 'amountCents', message: 'El abono supera el saldo pendiente' }],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  readSession.mockResolvedValue({ accessToken: 'token-de-prueba', role: 'ADMIN', who: null });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/** Argumentos de la única llamada a `fetch`. */
function requested(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init: init as RequestInit & { headers: Record<string, string> } };
}

describe('cliente de la API', () => {
  it('manda el token de la sesión y nunca lo devuelve al navegador', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await api('/admin/notes');

    const { url, init } = requested();
    expect(url).toContain('/api/v1/admin/notes');
    expect(init.headers.Authorization).toBe('Bearer token-de-prueba');
  });

  it('sin sesión no manda cabecera de autorización', async () => {
    // Mandar `Bearer undefined` convertiría un 401 limpio en un 400 raro.
    readSession.mockResolvedValue(null);
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api('/admin/notes');

    expect(requested().init.headers.Authorization).toBeUndefined();
  });

  it('pasa la clave de idempotencia cuando se le da', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}));
    await api('/admin/notes', { method: 'POST', body: { a: 1 }, idempotencyKey: 'clave-1' });

    const { init } = requested();
    expect(init.headers['Idempotency-Key']).toBe('clave-1');
    expect(init.body).toBe('{"a":1}');
  });

  it('nunca cachea: el saldo de hace un minuto es un saldo falso', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api('/admin/notes');
    expect(requested().init.cache).toBe('no-store');
  });

  it('traduce el problem+json a un error con los campos dentro', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, problem));

    const error = await api('/admin/notes/1/payments', { method: 'POST' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    const api422 = error as InstanceType<typeof ApiError>;
    expect(api422.status).toBe(422);
    expect(api422.message).toBe(problem.title);
    expect(api422.fieldErrors()).toEqual({
      amountCents: 'El abono supera el saldo pendiente',
    });
  });

  it('un error sin cuerpo sigue siendo un error legible', async () => {
    // Un 502 del proxy no trae problem+json: sin este camino la pantalla
    // enseñaría "undefined".
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));

    const error = (await api('/admin/notes').catch((caught: unknown) => caught)) as InstanceType<
      typeof ApiError
    >;
    expect(error.status).toBe(502);
    expect(error.message).toBe('Error 502');
    expect(error.fieldErrors()).toEqual({});
  });

  it('si la API no responde, el fallo llega como 503 con explicación', async () => {
    // `fetch failed` a secas no dice ni la ruta: la pantalla no podría decir
    // nada cierto.
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const error = (await api('/admin/notes').catch((caught: unknown) => caught)) as InstanceType<
      typeof ApiError
    >;
    expect(error.status).toBe(503);
    expect(error.problem?.type).toContain('api_unreachable');
    expect(error.problem?.detail).toContain('/admin/notes');
  });

  it('un 204 no intenta leer JSON de un cuerpo vacío', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api('/admin/payments/1/void', { method: 'POST' })).resolves.toBeUndefined();
  });
});
