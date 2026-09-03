'use server';

import { api, ApiError } from '@/shared/api/client';

export interface Simulation {
  folio: string;
  onDate: string;
  daysOverdue: number;
  principal: { cents: string; formatted: string };
  interest: { cents: string; formatted: string };
  total: { cents: string; formatted: string };
  interestRateLabel: string;
  settlement: { agreed: string; forgiven: string; dueOn: string; status: string } | null;
  summary: string;
}

export interface SimulationState {
  result?: Simulation;
  error?: string;
}

/** Consulta al simulador del servidor (§24.5). No guarda nada: es una pregunta. */
export async function simulateSettlementAction(
  noteId: string,
  _prev: SimulationState,
  formData: FormData,
): Promise<SimulationState> {
  const date = String(formData.get('date') ?? '').trim();

  try {
    const result = await api<Simulation>(
      `/admin/notes/${noteId}/simulate${date ? `?date=${encodeURIComponent(date)}` : ''}`,
    );
    return { result };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudo calcular la liquidación.' };
    }
    throw error;
  }
}
