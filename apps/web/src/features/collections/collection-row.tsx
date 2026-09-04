'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { registerActivityAction, type ActionState } from '@/features/notes/lifecycle-actions';
import { DateField } from '@/shared/ui/date-field';

/**
 * Una fila de la etapa, con la gestión al alcance.
 *
 * El cobrador abre Cobranza para saber a quién llamar hoy. Si para registrar el
 * resultado hay que entrar al pagaré y volver, la gestión no se registra: se
 * hace la llamada y se pierde. Por eso marcar, escribir el resultado y anotar la
 * promesa ocurren aquí, sin salir de la lista.
 */
export interface FilaCobranza {
  noteId: string;
  folio: string;
  debtorName: string;
  debtorPhone: string | null;
  balance: string;
  dueDate: string;
  daysOverdue: number;
}

export function CollectionRow({ fila, hoy }: { fila: FilaCobranza; hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  const telefono = fila.debtorPhone?.replace(/[^\d+]/g, '') ?? '';

  return (
    <li className="border-b border-line last:border-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link href={`/pagares/${fila.noteId}`} className="font-medium text-ink hover:underline">
            {fila.debtorName}
          </Link>
          <p className="tnum text-xs text-muted">
            {fila.folio} · vence {fila.dueDate}
            {fila.daysOverdue > 0 ? ` · ${fila.daysOverdue} días de atraso` : ''}
          </p>
        </div>

        <span className="tnum text-sm font-semibold text-ink">{fila.balance}</span>

        {/* Los enlaces del teléfono son la parte que de verdad ahorra tiempo:
            marcar sin copiar el número a mano (§24.2). */}
        {telefono ? (
          <span className="flex gap-1">
            <a href={`tel:${telefono}`} className="btn btn-ghost btn-sm" title="Llamar">
              Llamar
            </a>
            <a
              href={`https://wa.me/${telefono.replace('+', '')}`}
              target="_blank"
              rel="noopener"
              className="btn btn-ghost btn-sm"
              title="Abrir WhatsApp"
            >
              WhatsApp
            </a>
          </span>
        ) : (
          <span className="chip bg-surface-2 text-muted" title="Sin teléfono en el expediente">
            Sin teléfono
          </span>
        )}

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="btn btn-secondary btn-sm"
        >
          {abierto ? 'Cerrar' : 'Registrar gestión'}
        </button>
      </div>

      {abierto ? <FormularioGestion noteId={fila.noteId} hoy={hoy} /> : null}
    </li>
  );
}

const ETIQUETA = 'mb-1 block text-xs font-medium text-ink';
const CAMPO = 'input w-full text-sm';

function FormularioGestion({ noteId, hoy }: { noteId: string; hoy: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    registerActivityAction.bind(null, noteId),
    {},
  );
  const [resultado, setResultado] = useState('NO_ANSWER');

  return (
    <form action={action} className="space-y-3 bg-surface-2 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`tipo-${noteId}`} className={ETIQUETA}>
            Tipo de contacto
          </label>
          <select id={`tipo-${noteId}`} name="type" className={CAMPO}>
            <option value="CALL">Llamada</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Correo</option>
            <option value="VISIT">Visita</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        <div>
          <label htmlFor={`resultado-${noteId}`} className={ETIQUETA}>
            Resultado
          </label>
          <select
            id={`resultado-${noteId}`}
            name="outcome"
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            className={CAMPO}
          >
            <option value="NO_ANSWER">No contestó</option>
            <option value="PROMISED">Prometió pagar</option>
            <option value="REFUSED">Se negó</option>
            <option value="PAID">Ya pagó</option>
            <option value="DISPUTED">Disputa el adeudo</option>
          </select>
        </div>
      </div>

      {/* La fecha sólo aparece con promesa: es lo único que la vuelve exigible. */}
      {resultado === 'PROMISED' ? (
        <div>
          <label htmlFor={`fecha-${noteId}`} className={ETIQUETA}>
            Fecha prometida
          </label>
          <DateField id={`fecha-${noteId}`} name="promisedOn" min={hoy} required />
          <p className="mt-1 text-xs text-muted">
            Si no cumple, el pagaré vuelve solo a la bandeja de hoy.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor={`notas-${noteId}`} className={ETIQUETA}>
          Notas
        </label>
        <input id={`notas-${noteId}`} name="notes" placeholder="Qué se acordó" className={CAMPO} />
      </div>

      <div aria-live="polite" className="text-xs">
        {state.error ? <p className="text-crit">{state.error}</p> : null}
        {state.ok ? <p className="text-ok">{state.ok}</p> : null}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? 'Guardando…' : 'Guardar gestión'}
      </button>
    </form>
  );
}
