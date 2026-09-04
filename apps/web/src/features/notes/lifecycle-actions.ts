'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { api, ApiError } from '@/shared/api/client';

export interface ActionState {
  error?: string;
  ok?: string;
}

async function run(noteId: string, work: () => Promise<unknown>, okMessage: string): Promise<ActionState> {
  try {
    await work();
    revalidatePath(`/pagares/${noteId}`);
    revalidatePath('/pagares');
    return { ok: okMessage };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudo completar la acción.' };
    }
    throw error;
  }
}

/**
 * Anular y castigar exigen que el administrador **teclee el folio** para
 * confirmar (§24.5): son las dos acciones con impacto económico irreversible y
 * un clic accidental no debería bastar.
 */
export async function voidNoteAction(
  noteId: string,
  folio: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (String(formData.get('confirm') ?? '').trim() !== folio) {
    return { error: `Escribe el folio ${folio} para confirmar la anulación.` };
  }
  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/void`, {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: {
          reasonCode: String(formData.get('reasonCode') ?? 'other'),
          reasonNote: String(formData.get('reasonNote') ?? '').trim(),
        },
      }),
    'Pagaré anulado. Queda registrado con su motivo.',
  );
}

export async function writeOffNoteAction(
  noteId: string,
  folio: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (String(formData.get('confirm') ?? '').trim() !== folio) {
    return { error: `Escribe el folio ${folio} para confirmar el castigo.` };
  }
  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/write-off`, {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: {
          reasonCode: String(formData.get('reasonCode') ?? 'other'),
          reasonNote: String(formData.get('reasonNote') ?? '').trim(),
          // El folio también viaja al servidor: la comprobación de aquí es
          // comodidad, la que cuenta es la de allá (§4).
          confirmFolio: folio,
        },
      }),
    'Pagaré castigado. Sale de la cartera activa, pero la deuda sigue siendo exigible.',
  );
}

export async function extendNoteAction(
  noteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/extensions`, {
        method: 'POST',
        body: {
          newDueDate: String(formData.get('newDueDate') ?? ''),
          reason: String(formData.get('reason') ?? '').trim(),
        },
      }),
    'Prórroga registrada. El pagaré conserva su firma.',
  );
}

export async function renewNoteAction(
  noteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/renew`, {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: {
          newDueDate: String(formData.get('newDueDate') ?? ''),
          reason: String(formData.get('reason') ?? '').trim(),
        },
      }),
    'Pagaré renovado. El nuevo documento queda pendiente de firma.',
  );
}

/**
 * Convenio con quita. Como el castigo, exige teclear el folio (§24.5): la quita
 * es dinero perdonado y no se revierte.
 */
export async function createSettlementAction(
  noteId: string,
  folio: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (String(formData.get('confirm') ?? '').trim().toUpperCase() !== folio.toUpperCase()) {
    return { error: `Escribe el folio ${folio} para confirmar el convenio.` };
  }

  const toCents = (name: string): string => {
    const value = String(formData.get(name) ?? '').replace(/[^\d.]/g, '');
    return BigInt(Math.round(Number(value || '0') * 100)).toString();
  };

  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/settlements`, {
        method: 'POST',
        idempotencyKey: randomUUID(),
        body: {
          agreedCents: toCents('agreed'),
          forgivenCents: toCents('forgiven'),
          dueOn: String(formData.get('dueOn') ?? ''),
          confirmFolio: folio,
          ...(String(formData.get('terms') ?? '').trim()
            ? { terms: String(formData.get('terms')).trim() }
            : {}),
        },
      }),
    'Convenio registrado. Si se incumple, el saldo original se restablece solo.',
  );
}

export async function registerActivityAction(
  noteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = String(formData.get('outcome') ?? 'NO_ANSWER');
  const promisedOn = String(formData.get('promisedOn') ?? '').trim();

  if (outcome === 'PROMISED' && !promisedOn) {
    return { error: 'Una promesa de pago necesita fecha comprometida.' };
  }

  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/activities`, {
        method: 'POST',
        body: {
          type: String(formData.get('type') ?? 'CALL'),
          outcome,
          ...(promisedOn ? { promisedOn } : {}),
          ...(String(formData.get('notes') ?? '').trim()
            ? { notes: String(formData.get('notes')).trim() }
            : {}),
        },
      }),
    'Gestión registrada.',
  );
}

/**
 * Recordatorio de pago por correo, cuando el administrador lo decide (§18).
 * No hay envíos automáticos; por eso este botón existe.
 */
export async function sendReminderAction(
  noteId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return run(
    noteId,
    () => api(`/admin/notes/${noteId}/reminders`, { method: 'POST', body: {} }),
    'Recordatorio enviado por correo.',
  );
}

export async function voidPaymentAction(
  noteId: string,
  paymentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return run(
    noteId,
    () =>
      api(`/admin/payments/${paymentId}/void`, {
        method: 'POST',
        body: {
          reasonCode: 'capture_error',
          reasonNote: String(formData.get('reasonNote') ?? '').trim() || 'Corrección de captura',
        },
      }),
    'Abono anulado con un asiento de reversa. El original queda intacto.',
  );
}

export async function closeSettlementAction(
  noteId: string,
  settlementId: string,
  outcome: 'FULFILLED' | 'BROKEN',
  _prev: ActionState,
): Promise<ActionState> {
  return run(
    noteId,
    () => api(`/admin/settlements/${settlementId}`, { method: 'PATCH', body: { outcome } }),
    outcome === 'FULFILLED'
      ? 'Convenio cumplido. El pagaré queda liquidado y la quita se registra como pérdida.'
      : 'Convenio incumplido. El saldo original se restableció.',
  );
}

export async function reinstateNoteAction(
  noteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/reinstate`, {
        method: 'POST',
        body: {
          reasonCode: 'other',
          reasonNote: String(formData.get('reasonNote') ?? '').trim() || 'Reversión del castigo',
        },
      }),
    'Castigo revertido. El saldo vuelve a la cartera activa.',
  );
}

export async function openLegalCaseAction(
  noteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/legal-case`, {
        method: 'POST',
        body: {
          openedOn: String(formData.get('openedOn') ?? ''),
          ...(String(formData.get('courtName') ?? '').trim()
            ? { courtName: String(formData.get('courtName')).trim() }
            : {}),
          ...(String(formData.get('fileNumber') ?? '').trim()
            ? { fileNumber: String(formData.get('fileNumber')).trim() }
            : {}),
          ...(String(formData.get('lawyerName') ?? '').trim()
            ? { lawyerName: String(formData.get('lawyerName')).trim() }
            : {}),
        },
      }),
    'Expediente abierto. El pagaré queda marcado como en juicio.',
  );
}

/** Dónde está el pagaré original en papel: sin él no se puede demandar (§13.6). */
export async function setCustodyAction(
  noteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const location = String(formData.get('physicalDocumentLocation') ?? '').trim();
  if (location.length < 2) return { error: 'Escribe dónde está el documento físico.' };

  return run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/custody`, {
        method: 'PATCH',
        body: { physicalDocumentLocation: location },
      }),
    'Ubicación del documento registrada.',
  );
}

/**
 * Adelantar o congelar la etapa de gestión (§13.2).
 *
 * Congelar existe porque el calendario no sabe que el deudor contestó ayer: sin
 * esto, quien responde y negocia acaba escalado a judicial por acumulación de
 * días. Exige motivo, como toda decisión de criterio.
 */
export async function changeCollectionStageAction(
  noteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Escribe el motivo del cambio.' };

  const stage = String(formData.get('stage') ?? '').trim();
  const frozen = formData.get('frozen');

  const result = await run(
    noteId,
    () =>
      api(`/admin/notes/${noteId}/collection-stage`, {
        method: 'PATCH',
        body: {
          ...(stage ? { stage } : {}),
          ...(frozen === null ? {} : { frozen: frozen === 'on' }),
          reason,
        },
      }),
    'Etapa actualizada.',
  );
  revalidatePath('/cobranza');
  return result;
}
