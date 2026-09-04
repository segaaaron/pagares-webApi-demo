'use client';

import { DateField } from '@/shared/ui/date-field';
import { useBlockingActionState } from '@/shared/ui/blocking';
import { simulateEarlyPayoffAction, type EarlyPayoffState } from './early-payoff-actions';

/**
 * Liquidación anticipada de la serie (§12): "si paga todo hoy, ¿cuánto es?".
 *
 * Es la pregunta que hace el deudor por teléfono, y contestarla de memoria
 * lleva a sostener después un número equivocado. Lo que se ahorre depende de
 * cómo se pactó el interés, así que la pantalla lo dice en vez de insinuarlo:
 * sobre saldos insolutos el interés futuro no se causa, sobre saldo global sí.
 */
export function EarlyPayoff({ noteId, today }: { noteId: string; today: string }) {
  const [state, action, pending] = useBlockingActionState<EarlyPayoffState, FormData>(
    simulateEarlyPayoffAction.bind(null, noteId),
    {},
  );
  const r = state.result;

  return (
    <section className="card p-4" aria-label="Liquidación anticipada">
      <h2 className="text-sm font-semibold">¿Y si liquida todo de una vez?</h2>
      <p className="mt-1 text-xs text-muted">
        Salda los pagarés que quedan de la serie. Lo que se ahorre depende de cómo se pactó el
        interés.
      </p>

      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="payoff-date" className="mb-1.5 block text-sm font-medium text-ink">
            Fecha de la liquidación
          </label>
          <DateField id="payoff-date" name="date" min={today} defaultValue={today} required />
        </div>
        <button type="submit" disabled={pending} className="btn btn-secondary">
          {pending ? 'Calculando…' : 'Calcular'}
        </button>
      </form>

      <div aria-live="polite" className="mt-3">
        {state.error ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}

        {r ? (
          <div className="rounded-lg bg-surface-2 px-3 py-3">
            {/* La cifra que se dice por teléfono va primero y en grande: es la
                única que el deudor va a apuntar. */}
            <p className="text-xs text-muted">Paga hoy</p>
            <p className="tnum text-2xl font-semibold text-ink">{r.total.formatted}</p>
            <p className="mt-2 text-sm text-ink">{r.summary}</p>

            <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
              <Renglon etiqueta="Capital que queda" valor={r.principal.formatted} />
              {BigInt(r.interestDue.cents) > 0n ? (
                <Renglon etiqueta="Interés que sí se debe" valor={r.interestDue.formatted} />
              ) : null}
              {BigInt(r.lateInterest.cents) > 0n ? (
                <Renglon
                  etiqueta={`Moratorio por ${r.dueCount} ${r.dueCount === 1 ? 'cuota vencida' : 'cuotas vencidas'}`}
                  valor={r.lateInterest.formatted}
                />
              ) : null}
              {BigInt(r.saved.cents) > 0n ? (
                <Renglon
                  etiqueta="Interés que se ahorra"
                  valor={`− ${r.saved.formatted}`}
                  destacado
                />
              ) : null}
              <Renglon
                etiqueta="Siguiendo el calendario pagaría"
                valor={r.scheduleTotal.formatted}
                apagado
              />
            </dl>

            {r.planModel === 'GLOBAL' ? (
              <p className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                <span aria-hidden="true">▲</span>
                <span>
                  El interés se pactó sobre el importe original —saldo global—, así que adelantar el
                  pago no lo reduce. Si quiere hacerle un descuento, es una condonación y se
                  registra como tal.
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Renglon({
  etiqueta,
  valor,
  destacado = false,
  apagado = false,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  apagado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className={apagado ? 'text-xs text-muted' : 'text-xs text-ink-2'}>{etiqueta}</dt>
      <dd
        className={`tnum ${
          destacado ? 'font-semibold text-ok' : apagado ? 'text-muted' : 'text-ink'
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
