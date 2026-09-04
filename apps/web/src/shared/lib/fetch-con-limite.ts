/**
 * `fetch` con tiempo límite.
 *
 * Existe por un fallo concreto: registrar un abono dejó el botón en
 * «Registrando…» para siempre porque la petición no volvió —la API se estaba
 * reiniciando— y nadie la había acotado. Una petición sin límite no falla: se
 * queda, y con ella la pantalla.
 *
 * Los plazos son distintos según lo que se pida, y por eso se pasan a mano en
 * cada sitio: renovar la sesión bloquea la navegación entera y no puede esperar
 * lo mismo que un PDF de cien páginas.
 */
export const PLAZO = {
  /** Bloquea toda la navegación: lo que no llegue rápido, no llega. */
  sesion: 8_000,
  /** Formularios y consultas normales. */
  normal: 20_000,
  /** PDFs y paquetes comprimidos: se generan al momento (§17.1). */
  documento: 60_000,
} as const;

export async function fetchConLimite(
  url: string,
  init: RequestInit = {},
  ms: number = PLAZO.normal,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

/** `true` si el fallo fue por agotarse la espera y no por otra cosa. */
export function esTiempoAgotado(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}
