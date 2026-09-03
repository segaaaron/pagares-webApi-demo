'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface RecalculateState {
  ok?: string;
  error?: string;
}

/**
 * Recalcula el saldo de un pagaré desde su libro de abonos (§22.5).
 *
 * No corrige el libro —que es sólo de anexar— sino la copia denormalizada que
 * se guarda en el pagaré. Si el descuadre venía de un abono que falta, el saldo
 * subirá y se verá: entonces lo que toca es asentar ese abono.
 */
export async function recalculateBalanceAction(
  noteId: string,
  _prev: RecalculateState,
  _formData: FormData,
): Promise<RecalculateState> {
  try {
    const result = await api<{
      folio: string;
      before: string;
      after: string;
      changed: boolean;
      status: string;
    }>(`/admin/notes/${noteId}/recalculate-balance`, { method: 'POST', body: {} });

    revalidatePath('/ajustes');
    revalidatePath(`/pagares/${noteId}`);

    return {
      ok: result.changed
        ? `${result.folio}: ${result.before} → ${result.after} (${result.status}).`
        : `${result.folio} ya cuadraba.`,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudo recalcular el saldo.' };
    }
    throw error;
  }
}
