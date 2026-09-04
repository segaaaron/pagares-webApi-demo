'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface RetryResult {
  intentados: number;
  enviados: number;
  fallidos: number;
  primerError: string | null;
}

export interface RetryState {
  /** El nombre lo fija `useActionToast`: es el campo que dispara el aviso. */
  ok?: string;
  error?: string;
}

/**
 * Reintento de avisos que no salieron (§18.1).
 *
 * El mensaje dice qué pasó de verdad, no «listo»: reintentar cuando la causa
 * sigue sin arreglarse vuelve a fallar, y el administrador necesita ver el
 * motivo para saber si el problema es suyo o del proveedor de correo.
 */
async function retry(path: string): Promise<RetryState> {
  try {
    const result = await api<RetryResult>(path, { method: 'POST' });
    // La convención de la aplicación es revalidar por ruta: las consultas van
    // con `cache: 'no-store'`, así que una etiqueta no revalidaría nada.
    revalidatePath('/avisos');
    revalidatePath('/');

    if (result.intentados === 0) return { ok: 'No había ningún aviso atascado.' };
    if (result.fallidos === 0) {
      return {
        ok: result.enviados === 1 ? 'El aviso salió.' : `Salieron los ${result.enviados} avisos.`,
      };
    }
    return {
      error: result.primerError
        ? `${result.fallidos} de ${result.intentados} volvieron a fallar: ${result.primerError}`
        : `${result.fallidos} de ${result.intentados} volvieron a fallar.`,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudo reintentar el aviso.' };
    }
    throw error;
  }
}

export async function retryAllAction(_prev: RetryState, _formData: FormData): Promise<RetryState> {
  return retry('/admin/notifications/retry');
}

export async function retryOneAction(
  id: string,
  _prev: RetryState,
  _formData: FormData,
): Promise<RetryState> {
  return retry(`/admin/notifications/${id}/retry`);
}
