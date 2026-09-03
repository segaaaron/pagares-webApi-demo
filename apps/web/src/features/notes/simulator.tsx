'use client';

import { useActionState } from 'react';
import { DateField } from '@/shared/ui/date-field';
import { simulateSettlementAction, type SimulationState } from './simulator-actions';

/**
 * Simulador de liquidación (§24.5): "si paga el 15 de octubre, debe $X".
 *
 * La cifra la calcula el servidor, no el navegador: el interés moratorio es una
 * regla de dominio (§12.3) y reimplementarla aquí sería el defecto que describe
 * la regla 3 del repositorio.
 */
export function Simulator({ noteId, today }: { noteId: string; today: string }) {
  const [state, action, pending] = useActionState<SimulationState, FormData>(
    simulateSettlementAction.bind(null, noteId),
    {},
  );

  return (
    <section className="card p-4" aria-label="Simulador de liquidación">
      <h2 className="text-sm font-semibold">¿Cuánto debe si paga…?</h2>
      <p className="mt-1 text-xs text-muted">
        El interés moratorio corre por día natural, así que el saldo de hoy no es lo que deberá el
        día que pague.
      </p>

      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="simulate-date" className="mb-1.5 block text-sm font-medium text-ink">
            Fecha del pago
          </label>
          <DateField id="simulate-date" name="date" min={today} defaultValue={today} required />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary"
        >
          {pending ? 'Calculando…' : 'Calcular'}
        </button>
      </form>

      <div aria-live="polite" className="mt-3">
        {state.error ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}

        {state.result ? (
          <div className="rounded-lg bg-surface-2 px-3 py-3">
            <p className="text-sm text-ink">{state.result.summary}</p>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <dt className="text-muted">Capital</dt>
                <dd className="tnum mt-0.5 text-sm text-ink">{state.result.principal.formatted}</dd>
              </div>
              <div>
                <dt className="text-muted">Interés</dt>
                <dd className="tnum mt-0.5 text-sm text-ink">{state.result.interest.formatted}</dd>
              </div>
              <div>
                <dt className="text-muted">Total</dt>
                <dd className="tnum mt-0.5 text-sm font-semibold text-ink">
                  {state.result.total.formatted}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">
              {state.result.interestRateLabel} · {state.result.daysOverdue} días de atraso a esa
              fecha
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
