'use client';

import { sendNoteDocumentAction, type SendDocumentState } from './send-document-actions';
import { useBlockingActionState } from '@/shared/ui/blocking';

const OPTIONS = [
  { value: 'note', label: 'Pagaré firmado' },
  { value: 'statement', label: 'Estado de cuenta' },
  { value: 'release', label: 'Carta de finiquito' },
] as const;

/**
 * Mandar un documento al deudor por correo, con el PDF adjunto.
 *
 * El destinatario no se elige: es el correo del deudor. Poder teclearlo
 * convertiría el panel en una vía para mandar datos de un cliente a cualquier
 * dirección.
 */
export function SendDocument({ noteId, settled }: { noteId: string; settled: boolean }) {
  const [state, action, pending] = useBlockingActionState<SendDocumentState, FormData>(
    sendNoteDocumentAction.bind(null, noteId),
    {},
  );

  return (
    <form action={action} className="mt-3 border-t border-line pt-3">
      <label htmlFor="send-document" className="mb-1.5 block text-sm font-medium text-ink">
        Mandar por correo al deudor
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="send-document" name="document" className="input max-w-xs">
          {OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.value === 'release' && !settled}
            >
              {option.label}
              {option.value === 'release' && !settled ? ' (aún no liquidado)' : ''}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn btn-secondary">
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>

      <div aria-live="polite" className="mt-2">
        {state.ok ? <p className="text-xs text-ok">{state.ok}</p> : null}
        {state.error ? <p className="text-xs text-crit">{state.error}</p> : null}
      </div>
    </form>
  );
}
