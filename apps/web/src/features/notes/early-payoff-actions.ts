'use server';

import { api, ApiError } from '@/shared/api/client';

export interface EarlyPayoff {
  onDate: string;
  planModel: 'NONE' | 'INSOLUTOS' | 'GLOBAL';
  pendingCount: number;
  dueCount: number;
  principal: { cents: string; formatted: string };
  interestDue: { cents: string; formatted: string };
  saved: { cents: string; formatted: string };
  lateInterest: { cents: string; formatted: string };
  total: { cents: string; formatted: string };
  scheduleTotal: { cents: string; formatted: string };
  summary: string;
}

export interface EarlyPayoffState {
  result?: EarlyPayoff;
  error?: string;
}

/**
 * Pregunta al servidor cuánto es liquidar la serie ese día (§12).
 *
 * La cuenta no se hace aquí: qué interés se perdona depende de cómo se pactó, y
 * ésa es una regla de dominio, no una resta de pantalla.
 */
export async function simulateEarlyPayoffAction(
  noteId: string,
  _prev: EarlyPayoffState,
  formData: FormData,
): Promise<EarlyPayoffState> {
  const date = String(formData.get('date') ?? '').trim();

  try {
    const result = await api<EarlyPayoff>(
      `/admin/notes/${noteId}/early-payoff${date ? `?date=${encodeURIComponent(date)}` : ''}`,
    );
    return { result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudo calcular la liquidación anticipada.' };
    }
    throw error;
  }
}
