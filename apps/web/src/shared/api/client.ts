import 'server-only';
import type { ProblemDetails } from '@pagares/contracts';
import { readSession } from '../auth/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.title ?? `Error ${status}`);
  }

  /** Errores por campo, listos para pintarlos bajo cada input (§25.5). */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem?.errors ?? []) out[e.field] = e.message;
    return out;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  /** El listado se revalida al registrar un abono; el detalle no se cachea. */
  tags?: string[];
  /** Para lo que legítimamente tarda: un PDF grande, un reporte, un zip. */
  timeoutMs?: number;
}

/**
 * Cuánto se espera antes de darlo por perdido.
 *
 * Sin tope, una petición que nunca contesta —la API reiniciándose en mitad de un
 * despliegue, la red cortada— deja el botón en «Registrando…» para siempre, y
 * quien lo pulsó no sabe si su abono entró o no. Veinte segundos es de sobra
 * para todo lo que hace esta aplicación y bastante poco para no desesperar.
 */
const TIMEOUT_MS = 20_000;

/**
 * Cliente de la API. Corre **siempre en el servidor**: el token va en la
 * cabecera desde aquí y el navegador nunca lo ve.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = await readSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.accessToken}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  /**
   * Si la API no responde, el fallo llega como un `TypeError: fetch failed`
   * sin nada dentro: ni ruta, ni motivo, ni algo que enseñar a quien está
   * delante. Se traduce a un error del sistema, con el mismo formato que el
   * resto, para que la pantalla pueda decir algo cierto.
   */
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      ...(options.tags ? { next: { tags: options.tags } } : {}),
    });
  } catch (error) {
    /*
     * Se agotó la espera. Es distinto de «no contesta»: la petición pudo llegar
     * y estarse ejecutando, así que el mensaje no puede afirmar que no se hizo
     * nada. Las operaciones que escriben llevan clave de idempotencia (§12.4),
     * de modo que reintentarlas es seguro.
     */
    const agotado = error instanceof DOMException && error.name === 'TimeoutError';
    throw new ApiError(agotado ? 504 : 503, {
      type: `https://api.pagares.mx/errors/${agotado ? 'api_timeout' : 'api_unreachable'}`,
      title: agotado
        ? 'El servicio tardó demasiado en responder'
        : 'El servicio no responde en este momento',
      status: agotado ? 504 : 503,
      detail: agotado
        ? `La petición a ${path} superó los ${(options.timeoutMs ?? TIMEOUT_MS) / 1000} segundos. Puede que sí se haya hecho: recarga antes de repetirla.`
        : `No se pudo contactar con la API al pedir ${path}.`,
      traceId: 'local',
    });
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new ApiError(response.status, problem as ProblemDetails | null);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
