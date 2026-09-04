'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface IssueState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Emisión de un pagaré (§19.6). El administrador captura; el servidor genera el
 * folio, el importe en letra y el token público. Nada de eso se acepta del
 * formulario: si número y letra discreparan, el documento sería impugnable.
 */
export async function issueNoteAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  const pesos = String(formData.get('amount') ?? '').replace(/[^\d.]/g, '');
  if (!pesos || Number(pesos) <= 0) {
    return { fieldErrors: { amount: 'Escribe un importe mayor a cero.' } };
  }

  const rate = String(formData.get('interestRate') ?? '').trim();
  const period = String(formData.get('interestPeriod') ?? 'MONTHLY') === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';

  // Hasta dos avales, como el formulario impreso (§25.15). Se manda sólo lo
  // capturado: un aval a medias no es un aval.
  const guarantors = [1, 2]
    .map((position) => ({
      position,
      fullName: String(formData.get(`guarantor${position}Name`) ?? '').trim(),
      address: String(formData.get(`guarantor${position}Address`) ?? '').trim(),
      phone: String(formData.get(`guarantor${position}Phone`) ?? '').trim(),
    }))
    .filter((guarantor) => guarantor.fullName !== '');

  let created: { id: string };
  try {
    created = await api<{ id: string }>('/admin/notes', {
      method: 'POST',
      idempotencyKey: randomUUID(),
      body: {
        debtor: {
          // Con id, la API reutiliza al deudor y no crea un duplicado (§19.6).
          ...(String(formData.get('debtorId') ?? '').trim()
            ? { id: String(formData.get('debtorId')).trim() }
            : {}),
          fullName: String(formData.get('debtorName') ?? '').trim(),
          address: String(formData.get('debtorAddress') ?? '').trim(),
          phone: String(formData.get('debtorPhone') ?? '').trim(),
          ...(String(formData.get('debtorEmail') ?? '').trim()
            ? { email: String(formData.get('debtorEmail')).trim() }
            : {}),
        },
        issuePlace: String(formData.get('issuePlace') ?? '').trim(),
        issueDate: String(formData.get('issueDate') ?? ''),
        paymentPlace: String(formData.get('paymentPlace') ?? '').trim(),
        dueDate: String(formData.get('dueDate') ?? ''),
        creditorName: String(formData.get('creditorName') ?? '').trim(),
        amountCents: BigInt(Math.round(Number(pesos) * 100)).toString(),
        // Vacío significa "sin intereses pactados" (null), que no es lo mismo
        // que pactarlos en cero (§12.3). La periodicidad viaja con el número:
        // "3% mensual" y "3% anual" son deudas muy distintas.
        interestRate: rate === '' ? null : { value: Number(rate), period },
        /*
         * En cuántos pagos se documenta. Un pagaré es de pago único, así que
         * doce mensualidades son doce pagarés: el servidor los emite y reparte
         * el importe, porque mandar las cuotas desde aquí invita a que no sumen.
         */
        installments: Math.max(1, Number(formData.get('installments') ?? 1) || 1),
        /*
         * El interés del préstamo —lo que gana quien presta— y cómo se calcula.
         * Va aparte del moratorio a propósito: uno es el precio de prestar y el
         * otro la sanción por pagar tarde (§12).
         */
        plan: (() => {
          const model = String(formData.get('planModel') ?? 'NONE');
          const valor = String(formData.get('planRate') ?? '').trim();
          if (model !== 'INSOLUTOS' && model !== 'GLOBAL') return { model: 'NONE', rate: null };
          return {
            model,
            rate:
              valor === ''
                ? null
                : {
                    value: Number(valor),
                    period:
                      String(formData.get('planPeriod') ?? 'MONTHLY') === 'ANNUAL'
                        ? ('ANNUAL' as const)
                        : ('MONTHLY' as const),
                  },
          };
        })(),
        requiresGuarantors: guarantors.length,
        guarantors,
        ...(String(formData.get('observations') ?? '').trim()
          ? { observations: String(formData.get('observations')).trim() }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error: error.problem?.title ?? 'No se pudo emitir el pagaré.',
        fieldErrors: error.fieldErrors(),
      };
    }
    throw error;
  }

  revalidatePath('/pagares');
  redirect(`/pagares/${created.id}`);
}
