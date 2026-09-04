'use client';

import { useActionState } from 'react';
import { sendTodaysRemindersAction, type RemindersState } from './actions';
import { useActionToast } from '@/shared/ui/use-action-toast';

/**
 * El botón que manda los avisos del día.
 *
 * Dice cuántos son antes de pulsarlo: un botón que manda correos sin decir a
 * cuántos es un botón que se pulsa con miedo, o no se pulsa.
 */
export function SendTodaysReminders({ count }: { count: number }) {
  const [state, action, pending] = useActionState<RemindersState, FormData>(
    sendTodaysRemindersAction,
    {},
  );
  useActionToast(state, state.message ?? 'Recordatorios enviados.');

  return (
    <form action={action}>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending
          ? 'Enviando…'
          : count === 1
            ? 'Enviar el recordatorio'
            : `Enviar los ${count} recordatorios`}
      </button>
    </form>
  );
}
