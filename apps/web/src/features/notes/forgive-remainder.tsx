'use client';

import { useActionState, useState } from 'react';
import { forgiveRemainderAction, type ActionState } from './lifecycle-actions';

/**
 * Cerrar un pagaré por unos pesos de diferencia (§25.16).
 *
 * Aparece sólo cuando el saldo cabe dentro de la tolerancia de Ajustes. Es una
 * decisión con efecto económico, así que pide motivo y una confirmación: sin
 * ella, sería un botón de limpieza al lado del formulario de abonos, y algún
 * día alguien lo pulsaría creyendo que ordena la pantalla.
 */
export function ForgiveRemainder({
  noteId,
  balanceLabel,
}: {
  noteId: string;
  balanceLabel: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    forgiveRemainderAction.bind(null, noteId),
    {},
  );
  const [abierto, setAbierto] = useState(false);

  return (
    <section className="card p-4" aria-label="Cerrar por diferencia menor">
      <h2 className="text-sm font-semibold">Quedan {balanceLabel}</h2>
      <p className="mt-1 text-xs text-muted">
        Es menos que la tolerancia que fijaste en Ajustes. Suele pasar cuando el deudor consulta un
        día y transfiere otro: el interés de esos días deja este resto. Puedes cerrarlo condonando
        la diferencia; queda asentada en el libro como pérdida, no como cobro.
      </p>

      {abierto ? (
        <form action={action} className="mt-3 space-y-2">
          <label htmlFor="reasonNote" className="block text-xs text-muted">
            Por qué se cierra
          </label>
          <input
            id="reasonNote"
            name="reasonNote"
            required
            minLength={3}
            className="w-full input"
            placeholder="Transfirió el jueves lo que vio el lunes"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? 'Cerrando…' : `Condonar ${balanceLabel} y cerrar`}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="btn btn-secondary">
              Cancelar
            </button>
          </div>
          <div aria-live="polite">
            {state.error ? <p className="text-xs text-crit">{state.error}</p> : null}
            {state.ok ? <p className="text-xs text-ok">{state.ok}</p> : null}
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className="mt-3 btn btn-secondary">
          Dar por liquidado
        </button>
      )}
    </section>
  );
}
