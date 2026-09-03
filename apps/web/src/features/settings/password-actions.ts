'use server';

import { api, ApiError } from '@/shared/api/client';
import { readSession, writeSession } from '@/shared/auth/session';

export interface PasswordState {
  step: 'idle' | 'sent' | 'done';
  error?: string;
}

/**
 * Cambio de contraseña estando dentro (§10.3, flujo 3).
 *
 * Pide el código **antes** de cualquier otra cosa: la cuota de tres cambios por
 * semana se comprueba en el servidor al solicitarlo, no al confirmar, para no
 * mandar un correo que después se va a rechazar.
 */
export async function requestPasswordCodeAction(
  _prev: PasswordState,
  _formData: FormData,
): Promise<PasswordState> {
  try {
    await api('/auth/password/change/request', { method: 'POST', body: {} });
    return { step: 'sent' };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        step: 'idle',
        error:
          error.status === 429
            ? 'Demasiadas peticiones seguidas. Espera un minuto.'
            : (error.problem?.title ?? 'No se pudo enviar el código.'),
      };
    }
    throw error;
  }
}

/**
 * Confirma el cambio: código, contraseña actual y nueva.
 *
 * El código prueba acceso al correo y la contraseña actual prueba que quien está
 * frente al teclado es el dueño; con una sola de las dos, un equipo desbloqueado
 * bastaría. Al terminar quedan revocadas todas las sesiones menos ésta.
 */
export async function confirmPasswordChangeAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const newPassword = String(formData.get('newPassword') ?? '');
  if (newPassword !== String(formData.get('repeat') ?? '')) {
    return { step: 'sent', error: 'Las dos contraseñas no coinciden.' };
  }
  if (newPassword.length < 12) {
    return { step: 'sent', error: 'La contraseña debe tener al menos 12 caracteres.' };
  }

  try {
    const renewed = await api<{ accessToken: string; expiresIn: number }>(
      '/auth/password/change/confirm',
      {
        method: 'POST',
        body: {
          code: String(formData.get('code') ?? '').trim(),
          currentPassword: String(formData.get('currentPassword') ?? ''),
          newPassword,
        },
      },
    );

    // El cambio invalida el token con el que se hizo la llamada: se guarda el
    // que devuelve la API o la siguiente pantalla saldría con un 401.
    const session = await readSession();
    if (session) {
      await writeSession(renewed.accessToken, null, session.role, session.who ?? undefined);
    }

    return { step: 'done' };
  } catch (error) {
    if (error instanceof ApiError) {
      return { step: 'sent', error: error.problem?.title ?? 'El código o la contraseña actual no son correctos.' };
    }
    throw error;
  }
}
