'use server';

import { revalidateTag } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface RetryResult {
  intentados: number;
  enviados: number;
  fallidos: number;
  primerError: string | null;
}

export interface RetryState {
  message?: string;
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
    revalidateTag('avisos');

    if (result.intentados === 0) return { message: 'No había ningún aviso atascado.' };
    if (result.fallidos === 0) {
      return {
        message:
          result.enviados === 1 ? 'El aviso salió.' : `Salieron los ${result.enviados} avisos.`,
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
