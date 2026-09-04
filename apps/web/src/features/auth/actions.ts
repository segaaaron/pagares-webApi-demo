'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { clearSession, readRefreshToken, writeSession } from '@/shared/auth/session';
import { fetchConLimite } from '@/shared/lib/fetch-con-limite';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/**
 * El `changeToken` del reto de primer acceso vive en su propia cookie httpOnly
 * y caduca cuando él (§10.4): no puede ir en la URL —quedaría en el historial y
 * en los logs del proxy— ni en un campo oculto, que un XSS sí sabría leer.
 */
const CHANGE_TOKEN = 'pg_change';
const CHANGE_TOKEN_MAX_AGE = 10 * 60;

export interface LoginState {
  error?: string;
}

interface SessionPayload {
  outcome: 'session' | 'must_change_password';
  accessToken?: string;
  role?: string;
  user?: { fullName: string; email: string };
  changeToken?: string;
}

/** Guarda la sesión que acaba de emitir la API y manda al panel. */
async function adoptSession(response: Response, data: SessionPayload): Promise<never> {
  // El refresh viaja en cookie del dominio de la API; aquí se guarda el access
  // para las llamadas del servidor web.
  const setCookie = response.headers.get('set-cookie') ?? '';
  const refresh = /pagares_refresh=([^;]+)/.exec(setCookie)?.[1] ?? null;
  await writeSession(data.accessToken ?? '', refresh, data.role ?? 'CLIENT', data.user);
  redirect('/');
}

/**
 * Inicio de sesión. La llamada a la API ocurre en el servidor: la contraseña y
 * los tokens no pasan por JavaScript del navegador en ningún momento.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Escribe tu correo y tu contraseña.' };

  const response = await fetchConLimite(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  if (response.status === 423) {
    return { error: 'La cuenta está bloqueada temporalmente por intentos fallidos. Inténtalo más tarde.' };
  }
  if (response.status === 410) {
    return {
      error:
        'La contraseña temporal caducó. Pídele a un administrador que te genere otra: las temporales duran 72 horas.',
    };
  }
  if (!response.ok) {
    // Mismo mensaje exista o no la cuenta: distinguirlos permitiría enumerar usuarios.
    return { error: 'Correo o contraseña incorrectos.' };
  }

  const data = (await response.json()) as SessionPayload;

  if (data.outcome === 'must_change_password') {
    const jar = await cookies();
    jar.set(CHANGE_TOKEN, data.changeToken ?? '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: CHANGE_TOKEN_MAX_AGE,
    });
    redirect('/login/cambiar');
  }

  return adoptSession(response, data);
}

export interface ChangeInitialState {
  error?: string;
  /** El reto caducó o no existe: hay que volver a entrar con la temporal. */
  expired?: boolean;
}

/**
 * Cambio obligatorio del primer acceso (§10.3, flujo 2).
 *
 * **Sin OTP**: quien llega aquí ya demostró posesión de la contraseña temporal.
 * Termina con la sesión abierta, así que nadie escribe su contraseña dos veces.
 */
export async function changeInitialAction(
  _prev: ChangeInitialState,
  formData: FormData,
): Promise<ChangeInitialState> {
  const jar = await cookies();
  const changeToken = jar.get(CHANGE_TOKEN)?.value;
  if (!changeToken) return { expired: true };

  const newPassword = String(formData.get('newPassword') ?? '');
  const repeat = String(formData.get('repeat') ?? '');
  if (newPassword !== repeat) return { error: 'Las dos contraseñas no coinciden.' };
  if (newPassword.length < 12) return { error: 'La contraseña debe tener al menos 12 caracteres.' };

  const response = await fetchConLimite(`${API_URL}/api/v1/auth/password/change-initial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeToken, newPassword }),
    cache: 'no-store',
  });

  if (response.status === 401) {
    jar.delete(CHANGE_TOKEN);
    return { expired: true };
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { title?: string } | null;
    return { error: problem?.title ?? 'No se pudo cambiar la contraseña.' };
  }

  jar.delete(CHANGE_TOKEN);
  return adoptSession(response, (await response.json()) as SessionPayload);
}

export interface RecoverState {
  /** `sent` es lo que se responde exista o no la cuenta (§10.3, flujo 4). */
  step: 'request' | 'sent' | 'done';
  email?: string;
  error?: string;
}

/**
 * Petición del código de recuperación. Responde igual exista o no la cuenta:
 * decir "ese correo no está registrado" es regalar la lista de usuarios.
 */
export async function forgotPasswordAction(
  _prev: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { step: 'request', error: 'Escribe tu correo.' };

  const response = await fetchConLimite(`${API_URL}/api/v1/auth/password/forgot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });

  if (response.status === 429) {
    return { step: 'request', email, error: 'Demasiados intentos. Espera un minuto y vuelve a pedirlo.' };
  }

  // Un fallo del servidor tampoco distingue: se dice lo mismo siempre.
  return { step: 'sent', email };
}

/** Confirmación del código y contraseña nueva. Revoca **todas** las sesiones. */
export async function resetPasswordAction(
  prev: RecoverState,
  formData: FormData,
): Promise<RecoverState> {
  const email = String(formData.get('email') ?? prev.email ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  const newPassword = String(formData.get('newPassword') ?? '');
  const repeat = String(formData.get('repeat') ?? '');

  if (newPassword !== repeat) return { step: 'sent', email, error: 'Las dos contraseñas no coinciden.' };
  if (newPassword.length < 12) {
    return { step: 'sent', email, error: 'La contraseña debe tener al menos 12 caracteres.' };
  }

  const response = await fetchConLimite(`${API_URL}/api/v1/auth/password/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { title?: string } | null;
    return {
      step: 'sent',
      email,
      error: problem?.title ?? 'El código no es correcto o ya caducó.',
    };
  }

  return { step: 'done', email };
}

export async function logoutAction(): Promise<void> {
  const refresh = await readRefreshToken();
  await fetchConLimite(`${API_URL}/api/v1/auth/logout`, {
    method: 'POST',
    headers: refresh ? { Cookie: `pagares_refresh=${refresh}` } : {},
    cache: 'no-store',
  }).catch(() => null);
  await clearSession();
  redirect('/login');
}
