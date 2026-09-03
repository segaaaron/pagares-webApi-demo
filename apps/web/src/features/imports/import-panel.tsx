'use client';

import { useActionState } from 'react';
import { importCsvAction, type ImportState } from './actions';

const COLUMNS = {
  debtors: 'nombre, domicilio, telefono, correo (opcional), notas (opcional)',
  notes:
    'telefono_deudor, importe, fecha_emision, vencimiento, abonado, tasa, periodo_tasa, folio_original',
} as const;

const TITLE = {
  debtors: 'Importar deudores',
  notes: 'Importar pagarés existentes',
} as const;

/** «1 filas» delata que nadie leyó la pantalla; el plural se decide con el dato. */
const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Importación de cartera por CSV (§24.5).
 *
 * Valida antes de escribir y enseña los conflictos: las filas repetidas se
 * omiten en lugar de sobreescribir: un deudor ya dado de alta puede tener
 * pagarés y bitácora, y machacarlo con lo que traiga un Excel sería perder datos
 * sin rastro.
 */
export function ImportPanel({ kind }: { kind: 'debtors' | 'notes' }) {
  const [current, action, pending] = useActionState<ImportState, FormData>(
    importCsvAction.bind(null, kind),
    {},
  );

  const result = current.result;
  const blocking = (result?.issues ?? []).filter((issue) => issue.severity === 'error');
  const canCommit = Boolean(result && !result.committed && blocking.length === 0 && result.valid > 0);

  return (
    <section className="card p-4" aria-label={TITLE[kind]}>
      <h2 className="text-sm font-semibold">{TITLE[kind]}</h2>
      <p className="mt-1 text-xs text-muted">
        Columnas esperadas: <span className="font-mono">{COLUMNS[kind]}</span>. Separador coma o
        punto y coma; fechas en AAAA-MM-DD o DD/MM/AAAA.
      </p>
      {kind === 'notes' ? (
        <p className="mt-1 text-xs text-muted">
          Los deudores van primero. Los pagarés entran como firmados en papel y el folio lo asigna
          el sistema: el del papel queda en las observaciones.
        </p>
      ) : null}

      <form action={action} className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required={!result}
            aria-label="Archivo CSV"
            className="text-sm"
          />
          <button
            type="submit"
            name="commit"
            value="off"
            disabled={pending}
            className="btn btn-secondary"
          >
            {pending ? 'Trabajando…' : 'Revisar archivo'}
          </button>

          {/* Importar sólo aparece cuando la revisión salió limpia: es el paso
              que escribe, y no debe estar a un clic de distancia por descuido. */}
          {canCommit ? (
            <button
              type="submit"
              name="commit"
              value="on"
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? 'Importando…' : `Importar ${plural(result?.valid ?? 0, 'fila', 'filas')}`}
            </button>
          ) : null}
        </div>
      </form>

      <div aria-live="polite" className="mt-3 space-y-3">
        {current.error ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{current.error}</p>
        ) : null}

        {result ? (
          <>
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <p className="text-ink">
                {plural(result.rows, 'fila leída', 'filas leídas')} ·{' '}
                {plural(result.valid, 'lista para importar', 'listas para importar')} ·{' '}
                {plural(result.duplicates, 'ya existía', 'ya existían')}
              </p>
              {result.committed ? (
                <p className="mt-1 text-ok">
                  {plural(result.created ?? 0, 'fila importada', 'filas importadas')}. Las
                  repetidas se omitieron sin tocar lo que ya había.
                </p>
              ) : blocking.length > 0 ? (
                <p className="mt-1 text-crit">
                  Hay {plural(blocking.length, 'fila con errores', 'filas con errores')}: se
                  corrige el archivo y se vuelve a revisar. No se importa nada a medias.
                </p>
              ) : (
                <p className="mt-1 text-muted">Nada se ha escrito todavía.</p>
              )}
            </div>

            {result.issues.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-line">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-left text-muted">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Fila</th>
                      <th className="px-2 py-1.5 font-medium">Columna</th>
                      <th className="px-2 py-1.5 font-medium">Qué pasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {result.issues.map((issue, index) => (
                      <tr key={`${issue.row}-${issue.field}-${index}`}>
                        <td className="tnum px-2 py-1.5">{issue.row}</td>
                        <td className="px-2 py-1.5 font-mono">{issue.field}</td>
                        <td
                          className={`px-2 py-1.5 ${issue.severity === 'error' ? 'text-crit' : 'text-warn'}`}
                        >
                          {issue.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

          </>
        ) : null}
      </div>
    </section>
  );
}
