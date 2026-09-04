'use client';

import { useActionState } from 'react';
import { retryAllAction, retryOneAction, type RetryState } from './actions';
import { useActionToast } from '@/shared/ui/use-action-toast';

/**
 * Reintento de todos los avisos atascados.
 *
 * Es el botón del caso real: se arregla la causa —un dominio de correo sin
 * verificar, el proveedor caído— y hay que decirle al sistema que lo vuelva a
 * intentar. El despacho normal ya no lo hará: esas filas agotaron sus intentos.
 */
export function RetryAllButton({ count }: { count: number }) {
  const [state, action, pending] = useActionState<RetryState, FormData>(retryAllAction, {});
  useActionToast(state, state.message ?? 'Avisos reenviados.');

  return (
    <form action={action}>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending || count === 0}>
        {pending ? 'Reintentando…' : `Reintentar ${count === 1 ? 'el aviso' : `los ${count}`}`}
      </button>
    </form>
  );
}

export function RetryOneButton({ id }: { id: string }) {
  const retry = retryOneAction.bind(null, id);
  const [state, action, pending] = useActionState<RetryState, FormData>(retry, {});
  useActionToast(state, state.message ?? 'Aviso reenviado.');

  return (
    <form action={action}>
      <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
        {pending ? 'Enviando…' : 'Reintentar'}
      </button>
    </form>
  );
}
