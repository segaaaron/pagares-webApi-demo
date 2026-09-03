'use server';

import { api, ApiError } from '@/shared/api/client';

export interface SendDocumentState {
  ok?: string;
  error?: string;
}

/**
 * Reenvío de un documento del pagaré por correo (§16, correos 6, 15, 16 y 17).
 *
 * La alternativa que había era descargar el PDF y adjuntarlo desde el correo
 * personal, fuera de toda bitácora. Esto queda en `audit` con actor y
 * destinatario (§9.3).
 */
export async function sendNoteDocumentAction(
  noteId: string,
  _prev: SendDocumentState,
  formData: FormData,
): Promise<SendDocumentState> {
  const document = String(formData.get('document') ?? 'note');
  const paymentId = String(formData.get('paymentId') ?? '').trim();

  try {
    const result = await api<{ sentTo: string }>(`/admin/notes/${noteId}/send-email`, {
      method: 'POST',
      body: { document, ...(paymentId ? { paymentId } : {}) },
    });
    return { ok: `Enviado a ${result.sentTo}.` };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.problem?.title ?? 'No se pudo enviar el correo.' };
    }
    throw error;
  }
}
