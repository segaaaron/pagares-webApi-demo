'use server';

import { revalidateTag } from 'next/cache';
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
  message?: string;
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
    revalidateTag('avisos-hoy');
    revalidateTag('avisos');

    if (result.intentados === 0) return { message: 'Hoy no toca ningún recordatorio.' };
    if (result.fallidos > 0) {
      return {
        error: result.primerError
          ? `${result.fallidos} de ${result.intentados} no salieron: ${result.primerError}`
          : `${result.fallidos} de ${result.intentados} no salieron.`,
      };
    }
    if (result.enviados === 0) {
      return { message: 'Los avisos de hoy ya habían salido; no se mandó ninguno otra vez.' };
    }
    return {
      message:
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
