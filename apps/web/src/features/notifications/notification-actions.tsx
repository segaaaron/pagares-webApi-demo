'use client';

import { retryAllAction, retryOneAction, type RetryState } from './actions';
import { useActionToast } from '@/shared/ui/use-action-toast';
import { useBlockingActionState } from '@/shared/ui/blocking';

/**
 * Reintento de todos los avisos atascados.
 *
 * Es el botón del caso real: se arregla la causa —un dominio de correo sin
 * verificar, el proveedor caído— y hay que decirle al sistema que lo vuelva a
 * intentar. El despacho normal ya no lo hará: esas filas agotaron sus intentos.
 *
 * Sigue en pantalla —desactivado— cuando no queda nada atascado: si desapareciera
 * al vaciarse la lista, se llevaría consigo el mensaje de qué pasó.
 */
export function RetryAllButton({ count }: { count: number }) {
  const [state, action, pending] = useBlockingActionState<RetryState, FormData>(retryAllAction, {});
  useActionToast(state, state.ok ?? 'Avisos reenviados.');

  const etiqueta = (): string => {
    if (pending) return 'Reintentando…';
    if (count === 0) return 'Nada que reintentar';
    return `Reintentar ${count === 1 ? 'el aviso' : `los ${count}`}`;
  };

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending || count === 0}>
        {etiqueta()}
      </button>
      <p aria-live="polite" className="text-xs">
        {state.error ? <span className="text-crit">{state.error}</span> : null}
        {state.ok ? <span className="text-muted">{state.ok}</span> : null}
      </p>
    </form>
  );
}

export function RetryOneButton({ id }: { id: string }) {
  const retry = retryOneAction.bind(null, id);
  const [state, action, pending] = useBlockingActionState<RetryState, FormData>(retry, {});
  useActionToast(state, state.ok ?? 'Aviso reenviado.');

  return (
    <form action={action}>
      <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
        {pending ? 'Enviando…' : 'Reintentar'}
      </button>
    </form>
  );
}
