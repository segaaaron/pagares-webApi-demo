'use client';

import { useActionState } from 'react';
import { openLegalCaseAction, setCustodyAction, type ActionState } from './lifecycle-actions';
import { shortDate } from '@/shared/lib/format';
import { DateField } from '@/shared/ui/date-field';

const INPUT = 'w-full input';

/**
 * Expediente judicial y custodia del documento físico (§13.6).
 *
 * Para demandar hace falta el **pagaré original en papel**, que queda en el
 * juzgado. Saber en qué caja está no es un detalle administrativo.
 */
export function LegalPanel({
  noteId,
  legalCase,
  physicalDocumentLocation,
  today,
}: {
  noteId: string;
  legalCase: { id: string; fileNumber: string | null; courtName: string | null; openedOn: string } | null;
  physicalDocumentLocation: string | null;
  today: string;
}) {
  const [caseState, caseAction, casePending] = useActionState<ActionState, FormData>(
    openLegalCaseAction.bind(null, noteId),
    {},
  );
  const [custodyState, custodyAction, custodyPending] = useActionState<ActionState, FormData>(
    setCustodyAction.bind(null, noteId),
    {},
  );

  return (
    <section className="card p-4" aria-label="Expediente legal">
      <h2 className="mb-3 text-sm font-semibold">Expediente y documento físico</h2>

      <form action={custodyAction} className="mb-4 space-y-2">
        <label htmlFor="custody" className="block text-xs text-muted">
          Dónde está el pagaré original
        </label>
        <div className="flex gap-2">
          <input id="custody" name="physicalDocumentLocation" className={INPUT}
                 defaultValue={physicalDocumentLocation ?? ''}
                 placeholder="Caja 3, expediente 12 · o: en el juzgado" />
          <button type="submit" disabled={custodyPending}
                  className="shrink-0 btn btn-secondary">
            Guardar
          </button>
        </div>
        <div aria-live="polite">
          {custodyState.error ? <p className="text-xs text-crit">{custodyState.error}</p> : null}
          {custodyState.ok ? <p className="text-xs text-ok">{custodyState.ok}</p> : null}
        </div>
      </form>

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
        </dl>
      ) : (
        <form action={caseAction} className="space-y-2 border-t border-line pt-3">
          <p className="text-xs text-muted">
            Abrir expediente marca el pagaré como en juicio y congela los recordatorios automáticos.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input name="fileNumber" placeholder="Número de expediente" className={INPUT} />
            <input name="courtName" placeholder="Juzgado" className={INPUT} />
            <input name="lawyerName" placeholder="Abogado" className={INPUT} />
            <DateField name="openedOn" defaultValue={today} required />
          </div>
          <button type="submit" disabled={casePending}
                  className="btn btn-secondary">
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
