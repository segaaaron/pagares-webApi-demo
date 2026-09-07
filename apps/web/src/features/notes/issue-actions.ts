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

  /*
   * El interés es obligatorio y se lee **una sola vez**, como número.
   *
   * Antes se arrastraba la cadena cruda y cada sitio decidía por su cuenta si
   * estaba vacía: "0" no lo está, así que un interés pactado en cero acababa
   * mandando un plan con tasa cero y el servidor lo rechazaba con un 422 que no
   * decía nada. Pactar en cero es legítimo y no es lo mismo que no pactar
   * (art. 174 LGTOC): lo que significa es que no hay interés que repartir.
   */
  const rateText = String(formData.get('interestRate') ?? '').trim();
  if (rateText === '') {
    return { fieldErrors: { 'interestRate.value': 'Escribe el interés. Cero también vale.' } };
  }
  const rate = Number(rateText);
  if (!Number.isFinite(rate) || rate < 0) {
    return { fieldErrors: { 'interestRate.value': 'El interés tiene que ser un número, 0 o mayor.' } };
  }

  /*
   * La periodicidad viaja tal cual: "3% mensual" y "3% quincenal" son deudas
   * muy distintas, y colapsarlas aquí cambiaba en silencio lo que el
   * administrador eligió.
   */
  const period = periodoPactado(formData.get('interestPeriod'));
  const installments = Math.max(1, Number(formData.get('installments') ?? 1) || 1);

  // Sin ficha elegida no hay a quién emitirle: el contrato sólo acepta un id.
  const debtorId = String(formData.get('debtorId') ?? '').trim();
  if (!debtorId) {
    return { fieldErrors: { 'debtor.id': 'Elige al deudor de la lista antes de emitir.' } };
  }

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
        // La ficha ya existe: aquí sólo se elige. Mandar además nombre,
        // domicilio o teléfono lo rechaza el contrato (`debtor` es estricto).
        debtor: { id: debtorId },
        issuePlace: String(formData.get('issuePlace') ?? '').trim(),
        issueDate: String(formData.get('issueDate') ?? ''),
        paymentPlace: String(formData.get('paymentPlace') ?? '').trim(),
        creditorName: String(formData.get('creditorName') ?? '').trim(),
        amountCents: BigInt(Math.round(Number(pesos) * 100)).toString(),
        // Vacío significa "sin intereses pactados" (null), que no es lo mismo
        // que pactarlos en cero (§12.3). La periodicidad viaja con el número:
        // "3% mensual" y "3% anual" son deudas muy distintas.
        interestRate: { value: rate, period },
        /*
         * En cuántas cuotas se paga. Un pagaré por el total con su tabla (ADR
         * 0022): el servidor la arma, porque mandar las cuotas desde aquí
         * invita a que no sumen.
         */
        installments,
        paymentFrequency: formData.get('paymentFrequency') === 'BIWEEKLY' ? 'BIWEEKLY' : 'MONTHLY',
        /*
         * El interés del préstamo —lo que gana quien presta— y cómo se calcula.
         * Va aparte del moratorio a propósito: uno es el precio de prestar y el
         * otro la sanción por pagar tarde (§12).
         */
        /*
         * Un solo interés para todo el préstamo: el mismo número que va como
         * moratorio se reparte dentro de las cuotas. Sin tasa o con un solo
         * pago no hay plan que armar.
         */
        /*
         * Un solo interés para todo el préstamo: el mismo número se reparte
         * dentro de las cuotas. Sin interés o con un solo pago no hay nada que
         * repartir, y entonces el plan es `NONE` —que es lo que significa, no
         * un caso raro que haya que esquivar—.
         */
        plan:
          rate > 0 && installments > 1
            ? { model: 'GLOBAL' as const, rate: { value: rate, period } }
            : { model: 'NONE' as const, rate: null },
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

/**
 * La periodicidad tal y como se eligió, sin colapsarla.
 *
 * Un valor que no se reconoce cae en mensual, que es lo habitual en pagarés
 * entre particulares. Lo que no puede pasar es que «quincenal» se guarde como
 * «mensual»: sería la mitad de la tasa que se pactó, escrita en un documento
 * que el deudor firma.
 */
function periodoPactado(valor: FormDataEntryValue | null): 'MONTHLY' | 'BIWEEKLY' | 'ANNUAL' {
  const texto = String(valor ?? 'MONTHLY');
  if (texto === 'ANNUAL') return 'ANNUAL';
  if (texto === 'BIWEEKLY') return 'BIWEEKLY';
  return 'MONTHLY';
}
