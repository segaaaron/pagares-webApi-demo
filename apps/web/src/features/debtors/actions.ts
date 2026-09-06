'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface DebtorActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** La ficha recién creada: la pantalla la nombra en vez de decir «listo». */
  created?: { id: string; fullName: string };
}

/**
 * Alta de un deudor (§19.8).
 *
 * Es el **único** sitio donde nace una ficha a mano. La emisión ya no la crea al
 * vuelo: pedía otros campos que los de aquí y acabaron siendo dos capturas
 * distintas de la misma persona.
 *
 * Lo opcional se manda sólo si se escribió. Un correo vacío no es una cadena
 * vacía: es que no tiene, y son cosas distintas para todo lo que viene después.
 */
export async function createDebtorAction(
  _prev: DebtorActionState,
  formData: FormData,
): Promise<DebtorActionState> {
  const texto = (campo: string): string => String(formData.get(campo) ?? '').trim();
  const opcional = (campo: string): string | undefined => texto(campo) || undefined;

  try {
    const created = await api<{ id: string; fullName: string }>('/admin/debtors', {
      method: 'POST',
      idempotencyKey: randomUUID(),
      body: {
        fullName: texto('fullName'),
        address: texto('address'),
        phone: texto('phone'),
        ...(opcional('email') ? { email: opcional('email') } : {}),
        ...(opcional('notes') ? { notes: opcional('notes') } : {}),
        ...(opcional('curp') ? { curp: opcional('curp') } : {}),
      },
    });

    revalidatePath('/clientes');
    return { created };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error: error.problem?.title ?? 'No se pudo dar de alta al deudor.',
        fieldErrors: error.fieldErrors(),
      };
    }
    throw error;
  }
}
