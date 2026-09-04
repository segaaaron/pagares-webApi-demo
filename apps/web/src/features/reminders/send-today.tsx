'use client';

import { sendTodaysRemindersAction, type RemindersState } from './actions';
import { useActionToast } from '@/shared/ui/use-action-toast';
import { useBlockingActionState } from '@/shared/ui/blocking';

/**
 * El botón que manda los avisos del día.
 *
 * Dice cuántos son antes de pulsarlo: un botón que manda correos sin decir a
 * cuántos es un botón que se pulsa con miedo, o no se pulsa.
 *
 * Se queda en pantalla —desactivado— cuando ya no queda ninguno por mandar. No
 * es un detalle estético: al terminar, la lista pasa a cero y, si el botón
 * desapareciera con ella, se llevaría por delante el aviso de que salieron
 * antes de que a nadie le diera tiempo a leerlo.
 */
export function SendTodaysReminders({ count }: { count: number }) {
  const [state, action, pending] = useBlockingActionState<RemindersState, FormData>(
    sendTodaysRemindersAction,
    {},
  );
  useActionToast(state, state.ok ?? 'Recordatorios enviados.');

  const etiqueta = (): string => {
    if (pending) return 'Enviando…';
    if (count === 0) return 'Nada por enviar';
    return count === 1 ? 'Enviar el recordatorio' : `Enviar los ${count} recordatorios`;
  };

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={pending || count === 0}
      >
        {etiqueta()}
      </button>
      {/* El resultado también por escrito y junto al botón: el aviso flotante se
          va a los cinco segundos, y quien mira hacia otro lado se lo pierde. */}
      <p aria-live="polite" className="text-xs">
        {state.error ? <span className="text-crit">{state.error}</span> : null}
        {state.ok ? <span className="text-muted">{state.ok}</span> : null}
      </p>
    </form>
  );
}
