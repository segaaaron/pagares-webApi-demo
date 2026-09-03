import 'server-only';
import { cookies } from 'next/headers';

const ACCESS = 'pg_access';
const REFRESH = 'pg_refresh';
const ROLE = 'pg_role';
const WHO = 'pg_who';

export interface Session {
  accessToken: string;
  role: 'ADMIN' | 'CLIENT';
  /** Nombre y correo de quien entró. Sólo para mostrarlos; no autoriza nada. */
  who: { fullName: string; email: string } | null;
}

/**
 * La sesión vive en cookies `httpOnly` del propio servidor web (§9.2).
 * El token nunca llega a JavaScript del navegador, así que un XSS no puede
 * leerlo ni enviarlo a ningún lado.
 */
export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS)?.value;
  const role = jar.get(ROLE)?.value;
  if (!accessToken || (role !== 'ADMIN' && role !== 'CLIENT')) return null;

  const raw = jar.get(WHO)?.value;
  let who: Session['who'] = null;
  if (raw) {
    try {
      who = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Session['who'];
    } catch {
      // Cookie manipulada o de una versión vieja: se ignora, no se rompe la sesión.
      who = null;
    }
  }
  return { accessToken, role, who };
}

export async function readRefreshToken(): Promise<string | null> {
  return (await cookies()).get(REFRESH)?.value ?? null;
}

export async function writeSession(
  accessToken: string,
  refreshToken: string | null,
  role: string,
  who?: { fullName: string; email: string },
): Promise<void> {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(ACCESS, accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  jar.set(ROLE, role, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  if (who) {
    jar.set(WHO, Buffer.from(JSON.stringify(who), 'utf8').toString('base64url'), {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86_400,
    });
  }
  if (refreshToken) {
    jar.set(REFRESH, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86_400,
    });
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS, REFRESH, ROLE, WHO]) jar.delete(name);
}
