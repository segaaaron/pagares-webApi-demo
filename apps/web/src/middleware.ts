import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const ACCESS = 'pg_access';
const REFRESH = 'pg_refresh';
const ROLE = 'pg_role';
const WHO = 'pg_who';

/** Margen antes de la caducidad: evita renovar a mitad de una petición. */
const RENEW_MARGIN_SECONDS = 60;

/**
 * Lee la caducidad del JWT sin verificar la firma.
 *
 * No es un control de seguridad —la API valida el token en cada llamada— sino
 * una optimización: saber cuándo toca renovar sin gastar una petición.
 */
function expiresInSeconds(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    if (typeof decoded.exp !== 'number') return null;
    return decoded.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

/**
 * Renueva la sesión cuando el access token está por caducar (§10.4) y aplica las
 * cabeceras de seguridad de §9.2.
 *
 * El refresco vive aquí porque un Server Component no puede escribir cookies:
 * sólo el middleware, las Server Actions y los route handlers pueden.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  const remaining = access ? expiresInSeconds(access) : null;

  if (!refresh || (remaining !== null && remaining >= RENEW_MARGIN_SECONDS)) {
    const response = NextResponse.next();
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }

  const renewed = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: `pagares_refresh=${refresh}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!renewed?.ok) {
    // Refresh inválido o revocado: se limpia la sesión y se vuelve al acceso.
    const response = request.nextUrl.pathname.startsWith('/login')
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/login', request.url));
    for (const name of [ACCESS, REFRESH, ROLE, WHO]) response.cookies.delete(name);
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }

  const data = (await renewed.json()) as { accessToken: string; role: string };
  const nextRefresh = /pagares_refresh=([^;]+)/.exec(renewed.headers.get('set-cookie') ?? '')?.[1];
  const secure = process.env.NODE_ENV === 'production';

  /*
   * El token nuevo tiene que viajar en la MISMA petición, no sólo en la
   * respuesta. `request.cookies.set(...)` sobre un `NextResponse.next()` ya
   * creado no se propaga: el Server Component seguiría leyendo el token
   * caducado, la API respondería 401 y la página se caería o rebotaría al
   * acceso. La única forma de que el render en curso lo vea es reconstruir la
   * cabecera `cookie` y pasarla en `NextResponse.next({ request })`.
   */
  request.cookies.set(ACCESS, data.accessToken);
  request.cookies.set(ROLE, data.role);
  if (nextRefresh) request.cookies.set(REFRESH, nextRefresh);

  const headers = new Headers(request.headers);
  headers.set(
    'cookie',
    request.cookies
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; '),
  );

  const response = NextResponse.next({ request: { headers } });
  const options = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  response.cookies.set(ACCESS, data.accessToken, options);
  response.cookies.set(ROLE, data.role, options);
  if (nextRefresh) response.cookies.set(REFRESH, nextRefresh, { ...options, maxAge: 30 * 86_400 });

  applySecurityHeaders(response, request.nextUrl.pathname);
  return response;
}

/**
 * La única ruta que se sirve **para ser enmarcada**: la vista previa del correo,
 * que el panel muestra dentro de un iframe con `sandbox`.
 */
const FRAMEABLE = '/ajustes/vista-previa/';

/** Cabeceras de §9.2. `frame-ancestors 'none'` impide el clickjacking. */
function applySecurityHeaders(response: NextResponse, pathname = ''): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Next inyecta estilos en línea; los scripts sí quedan restringidos.
      "style-src 'self' 'unsafe-inline'",
      /*
       * `unsafe-eval` **sólo** en desarrollo: el runtime de react-refresh evalúa
       * cadenas para el hot reload, y sin permitirlo la CSP mata la hidratación
       * de todos los componentes cliente —los formularios dejan de responder y
       * el panel parece roto sin un solo error visible. En producción no hace
       * falta y no se concede (§9.2).
       */
      process.env.NODE_ENV === 'production'
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Las firmas llegan por URL prefirmada del almacenamiento.
      "img-src 'self' data: blob: http://localhost:9000 https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      /*
       * Nadie puede enmarcar el panel. La excepción es la vista previa del
       * correo: es un documento que existe para verse dentro de un iframe del
       * propio panel, y con `'none'` el navegador se niega a mostrarlo —el
       * recuadro sale vacío y sin ningún error a la vista.
       */
      pathname.startsWith(FRAMEABLE) ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

export const config = {
  // La consulta pública `/p/...` queda fuera: no tiene sesión que renovar.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|p/).*)'],
};
