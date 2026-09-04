'use client';

import {useState} from 'react';
import { openLegalCaseAction, setCustodyAction, type ActionState } from './lifecycle-actions';
import type { CustodyKind, CustodyLog } from './custody-queries';
import { shortDate } from '@/shared/lib/format';
import { DateField } from '@/shared/ui/date-field';
import { useBlockingActionState } from '@/shared/ui/blocking';

const INPUT = 'w-full input';

const MOVIMIENTO: Record<CustodyKind, { label: string; verbo: string }> = {
  RECEIVED: { label: 'Recibido', verbo: 'Lo recibimos' },
  MOVED: { label: 'Movido', verbo: 'Cambió de sitio' },
  HANDED_OVER: { label: 'Entregado', verbo: 'Se entregó' },
  RETURNED: { label: 'Devuelto al deudor', verbo: 'Se devolvió al deudor' },
  LOST: { label: 'Extraviado', verbo: 'Se extravió' },
};

/**
 * Expediente judicial y custodia del documento físico (§13.6).
 *
 * Para demandar hace falta el **pagaré original en papel**. Antes esto guardaba
 * un solo texto que se sobrescribía: quedaba el último sitio y se perdía quién
 * lo tuvo antes. El día que el documento no aparece, esa es justo la pregunta.
 */
export function LegalPanel({
  noteId,
  legalCase,
  custody,
  today,
}: {
  noteId: string;
  legalCase: { id: string; fileNumber: string | null; courtName: string | null; openedOn: string } | null;
  custody: CustodyLog;
  today: string;
}) {
  const [caseState, caseAction, casePending] = useBlockingActionState<ActionState, FormData>(
    openLegalCaseAction.bind(null, noteId),
    {},
  );
  const [custodyState, custodyAction, custodyPending] = useBlockingActionState<ActionState, FormData>(
    setCustodyAction.bind(null, noteId),
    {},
  );
  const [kind, setKind] = useState<CustodyKind>('MOVED');

  return (
    <section className="card p-4" aria-label="Expediente legal">
      <h2 className="mb-1 text-sm font-semibold">Expediente y documento físico</h2>
      <p className="mb-3 text-xs text-muted">
        Sin el pagaré original en papel no hay juicio ejecutivo. Cada movimiento se anexa con
        responsable y fecha; el anterior no se borra.
      </p>

      {custody.pendingReturn ? (
        <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          Este pagaré está liquidado y el documento sigue en tu poder. El deudor puede exigir que
          se le devuelva (art. 129 LGTOC), y mientras no se devuelva es un título que todavía
          puede circular. Regístralo como devuelto cuando se lo entregues.
        </p>
      ) : null}

      <dl className="mb-3 grid gap-1 rounded-lg bg-surface-2 px-3 py-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Dónde está</dt>
          <dd className="text-ink">{custody.currentLocation ?? 'Sin registrar'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Quién responde</dt>
          <dd className="text-ink">{custody.currentHolder ?? 'Sin registrar'}</dd>
        </div>
      </dl>

      <form action={custodyAction} className="mb-4 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Qué pasó</span>
            <select
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as CustodyKind)}
              className={INPUT}
            >
              {(Object.keys(MOVIMIENTO) as CustodyKind[]).map((value) => (
                <option key={value} value={value}>
                  {MOVIMIENTO[value].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Cuándo</span>
            <DateField name="occurredOn" defaultValue={today} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Dónde queda</span>
            <input name="location" className={INPUT} placeholder="Caja 3, expediente 12" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Quién responde por él</span>
            <input name="holder" className={INPUT} placeholder="Nombre de la persona" required />
          </label>
          {/* Sólo cuando hay entrega: preguntar "a quién" en un cambio de caja
              es pedir un dato que no existe. */}
          {kind === 'HANDED_OVER' ? (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-muted">A quién se le entregó</span>
              <input name="handedTo" className={INPUT} placeholder="Abogado, juzgado, mensajería" required />
            </label>
          ) : null}
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-muted">Nota (opcional)</span>
            <input name="notes" className={INPUT} placeholder="Acuse, folio de mensajería…" />
          </label>
        </div>
        <button type="submit" disabled={custodyPending} className="btn btn-secondary">
          {custodyPending ? 'Registrando…' : 'Registrar movimiento'}
        </button>
        <div aria-live="polite">
          {custodyState.error ? <p className="text-xs text-crit">{custodyState.error}</p> : null}
          {custodyState.ok ? <p className="text-xs text-ok">{custodyState.ok}</p> : null}
        </div>
      </form>

      {custody.events.length > 0 ? (
        <ol className="mb-4 divide-y divide-line border-t border-line text-sm">
          {custody.events.map((event) => (
            <li key={event.id} className="py-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={event.kind === 'LOST' ? 'font-medium text-crit' : 'text-ink'}>
                  {MOVIMIENTO[event.kind].verbo}
                </span>
                <span className="text-muted">{event.location}</span>
                <span className="tnum ml-auto text-xs text-muted">{shortDate(event.occurredOn)}</span>
              </div>
              <p className="text-xs text-muted">
                Responsable: {event.holder}
                {event.handedTo ? ` · Entregado a ${event.handedTo}` : ''}
                {event.notes ? ` · ${event.notes}` : ''}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      {legalCase ? (
        <dl className="space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Expediente</dt>
            <dd>{legalCase.fileNumber ?? 'Sin número'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Juzgado</dt>
            <dd>{legalCase.courtName ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Abierto el</dt>
            <dd className="tnum">{shortDate(legalCase.openedOn)}</dd>
          </div>
          <p className="pt-1 text-xs text-muted">
            Con expediente abierto, el plazo de prescripción queda interrumpido: el pagaré deja de
            aparecer en «por prescribir».
          </p>
        </dl>
      ) : (
        <form action={caseAction} className="space-y-2 border-t border-line pt-3">
          <p className="text-xs text-muted">
            Abrir expediente marca el pagaré como en juicio, congela los recordatorios automáticos
            e interrumpe el plazo de prescripción.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input name="fileNumber" placeholder="Número de expediente" className={INPUT} />
            <input name="courtName" placeholder="Juzgado" className={INPUT} />
            <input name="lawyerName" placeholder="Abogado" className={INPUT} />
            <DateField name="openedOn" defaultValue={today} required />
          </div>
          <button type="submit" disabled={casePending} className="btn btn-secondary">
            {casePending ? 'Abriendo…' : 'Abrir expediente'}
          </button>
          <div aria-live="polite">
            {caseState.error ? <p className="text-xs text-crit">{caseState.error}</p> : null}
            {caseState.ok ? <p className="text-xs text-ok">{caseState.ok}</p> : null}
          </div>
        </form>
      )}
    </section>
  );
}
