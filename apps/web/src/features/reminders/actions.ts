'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

interface RunResult {
  date: string;
  intentados: number;
  enviados: number;
  yaEstaban: number;
  fallidos: number;
  primerError: string | null;
}

export interface RemindersState {
  /** El nombre lo fija `useActionToast`: es el campo que dispara el aviso. */
  ok?: string;
  error?: string;
}

/**
 * Manda los recordatorios que tocan hoy (§13.1).
 *
 * El mensaje cuenta lo que pasó de verdad, incluidos los que ya habían salido:
 * un «listo» a secas deja al administrador sin saber si mandó uno o treinta.
 */
export async function sendTodaysRemindersAction(
  _prev: RemindersState,
  _formData: FormData,
): Promise<RemindersState> {
  try {
    const result = await api<RunResult>('/admin/reminders/today', { method: 'POST' });
    // Por ruta y no por etiqueta: las consultas van con `cache: 'no-store'`.
    revalidatePath('/');
    revalidatePath('/avisos');

    if (result.intentados === 0) return { ok: 'Hoy no toca ningún recordatorio.' };
    if (result.fallidos > 0) {
      return {
        error: result.primerError
          ? `${result.fallidos} de ${result.intentados} no salieron: ${result.primerError}`
          : `${result.fallidos} de ${result.intentados} no salieron.`,
      };
    }
    if (result.enviados === 0) {
      return { ok: 'Los avisos de hoy ya habían salido; no se mandó ninguno otra vez.' };
    }
    return {
      ok:
        result.enviados === 1
          ? 'Salió el recordatorio de hoy.'
          : `Salieron los ${result.enviados} recordatorios de hoy.`,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudieron mandar los recordatorios.' };
    }
    throw error;
  }
}
