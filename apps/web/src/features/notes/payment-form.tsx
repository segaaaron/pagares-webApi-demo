'use client';

import { useActionState } from 'react';
import { registerPaymentAction, type PaymentState } from './payment-actions';
import { DateField } from '@/shared/ui/date-field';
import { useActionToast } from '@/shared/ui/use-action-toast';

const METHODS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CHECK', label: 'Cheque' },
  { value: 'OTHER', label: 'Otro' },
] as const;

export function PaymentForm({
  noteId,
  today,
  disabledReason,
}: {
  noteId: string;
  today: string;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<PaymentState, FormData>(
    registerPaymentAction.bind(null, noteId),
    {},
  );

  useActionToast(state, 'Abono registrado. El saldo ya está actualizado.');

  if (disabledReason) {
    // La acción no se oculta: se explica por qué no está disponible (§19.5).
    return (
      <div className="card bg-surface-2 p-4 text-sm text-muted">
        No se pueden registrar abonos: {disabledReason}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 card p-4">
      <h3 className="text-sm font-semibold text-ink">Registrar abono</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="amount" className="mb-1 block text-xs text-muted">
            Importe (pesos)
          </label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            className="tnum w-full input text-right"
          />
          {state.fieldErrors?.amount ? (
            <p className="mt-1 text-xs text-crit">{state.fieldErrors.amount}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="paidOn" className="mb-1 block text-xs text-muted">
            Fecha de pago
          </label>
          <DateField id="paidOn" name="paidOn" defaultValue={today} max={today} required />
        </div>

        <div>
          <label htmlFor="method" className="mb-1 block text-xs text-muted">
            Método
          </label>
          <select
            id="method"
            name="method"
            className="w-full input"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reference" className="mb-1 block text-xs text-muted">
            Referencia del depósito
          </label>
          <input
            id="reference"
            name="reference"
            placeholder="Referencia del banco"
            className="w-full input"
          />
        </div>
      </div>

      <div aria-live="polite">
        {state.error ? (
          <p className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}
        {state.ok ? (
          <p className="rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
            Abono registrado. Saldo restante actualizado.
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? 'Registrando…' : 'Registrar abono'}
      </button>
    </form>
  );
}
