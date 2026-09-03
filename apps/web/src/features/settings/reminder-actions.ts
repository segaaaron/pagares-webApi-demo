'use server';

import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface ReminderRule {
  id: string;
  offsetDays: number;
  channel: 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS';
  templateId: string;
  active: boolean;
  condition: { minBalanceCents?: string; debtorId?: string } | null;
  sentCount: number;
  updatedAt: string;
}

export interface ReminderRulesData {
  rules: ReminderRule[];
  /** Las plantillas que una regla puede usar; las manda el servidor (§13.1). */
  templates: string[];
}

export interface RulesState {
  ok?: string;
  error?: string;
}

export async function getReminderRules(): Promise<ReminderRulesData> {
  return api<ReminderRulesData>('/admin/reminder-rules');
}

/**
 * Guarda el juego completo de reglas (§13.1).
 *
 * Se manda entero y no fila a fila: la pantalla es la dueña del conjunto, y un
 * guardado parcial dejaría la cartera avisada por la mitad.
 */
export async function saveReminderRulesAction(
  _prev: RulesState,
  formData: FormData,
): Promise<RulesState> {
  const offsets = formData.getAll('offsetDays').map((value) => Number(value));
  const templates = formData.getAll('templateId').map(String);
  const actives = formData.getAll('active').map((value) => String(value) === 'on');
  const minima = formData.getAll('minBalance').map((value) => String(value).trim());

  const rules = offsets.map((offsetDays, index) => {
    const min = minima[index] ?? '';
    return {
      offsetDays,
      channel: 'EMAIL' as const,
      templateId: templates[index] ?? 'due-reminder',
      active: actives[index] ?? false,
      // Vacío es "sin condición"; cero sería "saldo cero", que no avisa a nadie.
      condition: min === '' ? null : { minBalanceCents: toCents(min) },
    };
  });

  try {
    await api('/admin/reminder-rules', { method: 'PUT', body: { rules } });
    revalidatePath('/ajustes');
    return { ok: `${rules.length} reglas guardadas.` };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudieron guardar las reglas.' };
    }
    throw error;
  }
}

/**
 * Envío de prueba de una regla (§24.5).
 *
 * La prueba va a la cuenta de quien la pide: el destinatario no es un campo del
 * formulario, precisamente para que esto no sea una vía de envío libre. La vista
 * previa en pantalla la sirve su propia ruta.
 */
export async function previewReminderAction(
  ruleId: string,
  _prev: RulesState,
  formData: FormData,
): Promise<RulesState> {
  // Qué botón se pulsó viaja en el propio formulario. Con dos acciones
  // enlazadas —una por botón— hacían falta dos estados para la misma fila, y el
  // que no se usaba pisaba al otro al re-renderizar.
  const sendTest = String(formData.get('sendTest') ?? '') === 'on';

  try {
    const result = await api<{ sentTo: string | null }>(
      `/admin/reminder-rules/${ruleId}/preview`,
      { method: 'POST', body: { sendTest } },
    );
    // El HTML **no** entra en el estado: lo sirve `/ajustes/vista-previa/[rule]`
    // y lo carga el iframe. Un documento completo dentro del estado de React es
    // lo que colgaba el navegador.
    return result.sentTo
      ? { ok: `Correo de prueba enviado a ${result.sentTo}.` }
      : { ok: 'Vista previa generada.' };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudo generar la vista previa.' };
    }
    throw error;
  }
}

/** "1,500.50" → "150050" en centavos, sin pasar por coma flotante. */
function toCents(value: string): string {
  const cleaned = value.replace(/[$\s,]/g, '');
  const [pesos = '0', centavos = ''] = cleaned.split('.');
  return (BigInt(pesos || '0') * 100n + BigInt(centavos.padEnd(2, '0').slice(0, 2) || '0')).toString();
}
