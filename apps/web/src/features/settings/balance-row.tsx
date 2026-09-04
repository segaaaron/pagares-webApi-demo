'use client';

import { recalculateBalanceAction, type RecalculateState } from './balance-actions';
import { useBlockingActionState } from '@/shared/ui/blocking';

export interface Mismatch {
  id: string;
  folio: string;
  debtorName: string;
  stored: string;
  ledger: string;
  difference: string;
}

/**
 * Una fila descuadrada, con su salida.
 *
 * Sin el botón, el cuadre sólo sabía dar malas noticias: señalaba el problema y
 * dejaba `psql` como única forma de resolverlo. Recalcular no toca el libro,
 * sólo la copia que guarda el pagaré.
 */
export function BalanceRow({ row }: { row: Mismatch }) {
  const [state, action, pending] = useBlockingActionState<RecalculateState, FormData>(
    recalculateBalanceAction.bind(null, row.id),
    {},
  );

  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/pagares/${row.id}`} className="font-mono text-xs text-accent-ink underline">
          {row.folio}
        </a>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{row.debtorName}</span>
        <span className="tnum shrink-0 text-xs text-muted">
          saldo {row.stored} · libro {row.ledger}
        </span>
        <span className="tnum shrink-0 text-xs text-crit">{row.difference}</span>
        <form action={action}>
          <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
            {pending ? 'Recalculando…' : 'Recalcular'}
          </button>
        </form>
      </div>

      <div aria-live="polite">
        {state.ok ? <p className="mt-1 text-xs text-ok">{state.ok}</p> : null}
        {state.error ? <p className="mt-1 text-xs text-crit">{state.error}</p> : null}
      </div>
    </li>
  );
}
