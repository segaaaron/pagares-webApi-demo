'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface UserActionState {
  error?: string;
  /** La temporal se muestra **una sola vez** y no vuelve a estar disponible (§8.3). */
  credential?: { email: string; password: string; expiresAt: string };
  ok?: string;
}

export async function createUserAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    const created = await api<{ email: string; temporaryPassword: string; temporaryPasswordExpiresAt: string }>(
      '/admin/users',
      {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: {
          email: String(formData.get('email') ?? '').trim(),
          fullName: String(formData.get('fullName') ?? '').trim(),
          ...(String(formData.get('phone') ?? '').trim() ? { phone: String(formData.get('phone')).trim() } : {}),
          role: 'CLIENT',
          // Presente sólo cuando el alta sale de la ficha de un deudor: enlaza
          // la cuenta con la persona y le devuelve sus pagarés.
          ...(String(formData.get('debtorId') ?? '').trim()
            ? { debtorId: String(formData.get('debtorId')).trim() }
            : {}),
        },
      },
    );
    revalidatePath('/usuarios');
    revalidatePath('/clientes');
    return {
      credential: {
        email: created.email,
        password: created.temporaryPassword,
        expiresAt: created.temporaryPasswordExpiresAt,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.problem?.title ?? 'No se pudo crear la cuenta.' };
    throw error;
  }
}

export async function manageUserAction(
  userId: string,
  action: 'reset-password' | 'unlock' | 'suspend' | 'activate',
  _prev: UserActionState,
): Promise<UserActionState> {
  try {
    const result = await api<{ temporaryPassword?: string; expiresAt?: string; status: string }>(
      `/admin/users/${userId}/${action}`,
      { method: 'POST', body: {} },
    );
    revalidatePath('/usuarios');

    if (action === 'reset-password' && result.temporaryPassword) {
      return {
        credential: {
          email: '',
          password: result.temporaryPassword,
          expiresAt: result.expiresAt ?? '',
        },
      };
    }
    const labels = { unlock: 'Cuenta desbloqueada.', suspend: 'Cuenta suspendida.', activate: 'Cuenta reactivada.' };
    return { ok: labels[action as keyof typeof labels] ?? 'Listo.' };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.problem?.title ?? 'No se pudo completar la acción.' };
    throw error;
  }
}

/**
 * Eliminar el acceso a la aplicación (§25.2).
 *
 * Borra la cuenta y libera el correo. El deudor y sus pagarés se quedan donde
 * están: la deuda no depende de una credencial, y el acceso se vuelve a crear
 * desde la ficha del deudor cuando haga falta.
 */
export async function deleteUserAccessAction(
  userId: string,
  _prev: UserActionState,
): Promise<UserActionState> {
  try {
    const result = await api<{ notesKept: number }>(`/admin/users/${userId}`, { method: 'DELETE' });
    revalidatePath('/usuarios');
    revalidatePath('/clientes');

    return {
      ok:
        result.notesKept > 0
          ? `Acceso eliminado. Sus ${result.notesKept} ${result.notesKept === 1 ? 'pagaré sigue' : 'pagarés siguen'} en la cartera.`
          : 'Acceso eliminado.',
    };
  } catch (error) {
    if (error instanceof ApiError) return { error: error.problem?.title ?? 'No se pudo eliminar el acceso.' };
    throw error;
  }
}
