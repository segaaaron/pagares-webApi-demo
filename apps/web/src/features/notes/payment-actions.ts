'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface PaymentState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: { balance: string; status: string };
}

/**
 * Registro de un abono desde el dashboard.
 *
 * La clave de idempotencia se genera aquí, en el servidor: si el administrador
 * pulsa dos veces o la red corta y el navegador reintenta, el abono no se duplica.
 */
export async function registerPaymentAction(
  noteId: string,
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const pesos = String(formData.get('amount') ?? '').replace(/[^\d.]/g, '');
  if (!pesos || Number(pesos) <= 0) {
    return { fieldErrors: { amount: 'Escribe un importe mayor a cero.' } };
  }

  // El dinero viaja en centavos enteros; nunca como decimal (§12.1).
  const cents = BigInt(Math.round(Number(pesos) * 100)).toString();

  try {
    const result = await api<{ balanceCents: string; status: string }>(
      `/admin/notes/${noteId}/payments`,
      {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: {
          amountCents: cents,
          paidOn: String(formData.get('paidOn') ?? ''),
          method: String(formData.get('method') ?? 'CASH'),
          reference: String(formData.get('reference') ?? '') || undefined,
        },
      },
    );
    revalidatePath(`/pagares/${noteId}`);
    revalidatePath('/pagares');
    return { ok: { balance: result.balanceCents, status: result.status } };
  } catch (error) {
    if (error instanceof ApiError) {
      // El mensaje de la API trae el saldo real cuando el abono lo supera.
      return { error: error.problem?.title ?? 'No se pudo registrar el abono.', fieldErrors: error.fieldErrors() };
    }
    throw error;
  }
}
