'use client';

import { useActionState } from 'react';
import { closeSettlementAction, reinstateNoteAction, type ActionState } from './lifecycle-actions';
import { shortDate } from '@/shared/lib/format';
import { useActionToast } from '@/shared/ui/use-action-toast';

/**
 * Convenio vigente (§13.4). Se cierra desde aquí: cumplido liquida el pagaré y
 * registra la quita como pérdida; incumplido **restablece el saldo original**.
 */
export function SettlementPanel({
  noteId,
  settlement,
}: {
  noteId: string;
  settlement: { id: string; agreed: string; forgiven: string; dueOn: string; status: string };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) =>
      closeSettlementAction(
        noteId,
        settlement.id,
        String(formData.get('outcome')) as 'FULFILLED' | 'BROKEN',
        prev,
      ),
    {},
  );

  useActionToast(state, 'Convenio actualizado.');

  return (
    <section className="rounded-lg border border-warn bg-warn-soft p-4" aria-label="Convenio vigente">
      <h2 className="text-sm font-semibold text-warn">Convenio vigente</h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-2">Monto convenido</dt>
          <dd className="tnum font-medium">{settlement.agreed}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">Quita otorgada</dt>
          <dd className="tnum">{settlement.forgiven}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">Fecha límite</dt>
          <dd className="tnum">{shortDate(settlement.dueOn)}</dd>
        </div>
      </dl>

      <form action={action} className="mt-3 space-y-2">
        <div className="flex gap-2">
          <button name="outcome" value="FULFILLED" disabled={pending}
                  className="rounded border border-ok px-2.5 py-1.5 text-xs font-medium text-ok hover:bg-ok-soft disabled:opacity-50">
            Marcar cumplido
          </button>
          <button name="outcome" value="BROKEN" disabled={pending}
                  className="rounded border border-crit px-2.5 py-1.5 text-xs font-medium text-crit hover:bg-crit-soft disabled:opacity-50">
            Marcar incumplido
          </button>
        </div>
        <p className="text-xs text-ink-2">
          Si se incumple, el saldo original se restablece y la quita deja de aplicar.
        </p>
        <div aria-live="polite">
          {state.error ? <p className="text-xs text-crit">{state.error}</p> : null}
          {state.ok ? <p className="text-xs text-ok">{state.ok}</p> : null}
        </div>
      </form>
    </section>
  );
}

/** Reversión del castigo: la única salida de `WRITTEN_OFF` (§11.3). */
export function ReinstatePanel({ noteId }: { noteId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    reinstateNoteAction.bind(null, noteId),
    {},
  );

  return (
    <section className="rounded-lg border border-crit bg-surface p-4" aria-label="Pagaré castigado">
      <h2 className="text-sm font-semibold text-crit">Pagaré castigado</h2>
      <p className="mt-1 text-xs text-muted">
        Salió de la cartera activa, pero la deuda sigue siendo exigible: los abonos que
        recibas se registran como recuperación.
      </p>
      <form action={action} className="mt-3 space-y-2">
        <input name="reasonNote" required minLength={3} placeholder="Motivo de la reversión"
               className="w-full input" />
        <button type="submit" disabled={pending}
                className="rounded border border-line-strong px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50">
          {pending ? 'Revirtiendo…' : 'Revertir el castigo'}
        </button>
        <div aria-live="polite">
          {state.error ? <p className="text-xs text-crit">{state.error}</p> : null}
          {state.ok ? <p className="text-xs text-ok">{state.ok}</p> : null}
        </div>
      </form>
    </section>
  );
}
