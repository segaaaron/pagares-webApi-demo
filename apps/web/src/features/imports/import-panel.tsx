'use client';

import { useActionState, useRef, useState } from 'react';
import { importCsvAction, type ImportState } from './actions';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

/**
 * Las columnas, una a una y con su ejemplo.
 *
 * Antes iban en un párrafo corrido de monoespaciado que había que leer con el
 * dedo para saber cuáles eran obligatorias. Puestas en lista se ven de un
 * vistazo, y el ejemplo enseña el formato —la fecha, el importe— que es
 * exactamente lo que se teclea mal.
 */
const COLUMNAS = {
  debtors: [
    { nombre: 'nombre', ejemplo: 'Juana Ejemplo Ramírez', obligatoria: true },
    { nombre: 'domicilio', ejemplo: 'Av. Madero 412, Centro', obligatoria: true },
    { nombre: 'telefono', ejemplo: '+524431112233', obligatoria: true },
    { nombre: 'correo', ejemplo: 'juana@ejemplo.mx', obligatoria: false },
    { nombre: 'notas', ejemplo: 'Paga los viernes', obligatoria: false },
  ],
  notes: [
    { nombre: 'telefono_deudor', ejemplo: '+524431112233', obligatoria: true },
    { nombre: 'importe', ejemplo: '25000.00', obligatoria: true },
    { nombre: 'fecha_emision', ejemplo: '2026-01-15', obligatoria: true },
    { nombre: 'vencimiento', ejemplo: '2026-07-15', obligatoria: true },
    { nombre: 'abonado', ejemplo: '5000.00', obligatoria: false },
    { nombre: 'tasa', ejemplo: '3', obligatoria: false },
    { nombre: 'periodo_tasa', ejemplo: 'MONTHLY', obligatoria: false },
    { nombre: 'folio_original', ejemplo: 'Pagaré 018 del talonario', obligatoria: false },
  ],
} as const;

const PANEL = {
  debtors: {
    paso: 1,
    titulo: 'Primero, los deudores',
    porQue: 'Un pagaré se cuelga de una persona: sin ella dada de alta, no hay dónde ponerlo.',
    plantilla: '/clientes/plantilla/deudores',
  },
  notes: {
    paso: 2,
    titulo: 'Después, sus pagarés',
    porQue:
      'Se enlazan por el teléfono del deudor. Entran como firmados en papel, y el folio lo asigna el sistema: el del talonario se guarda en las observaciones.',
    plantilla: '/clientes/plantilla/pagares',
  },
} as const;

/** «1 filas» delata que nadie leyó la pantalla; el plural se decide con el dato. */
const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Importación de cartera por CSV (§24.5).
 *
 * Son dos pasos y en este orden, y la pantalla lo dice: antes eran dos tarjetas
 * gemelas sin nada que indicara cuál va primero.
 *
 * Nada se escribe hasta la segunda pulsación. Revisar valida el archivo entero y
 * enseña los conflictos; las filas repetidas se omiten en vez de sobreescribir,
 * porque un deudor ya dado de alta puede tener pagarés y bitácora, y machacarlo
 * con lo que traiga un Excel sería perder datos sin rastro.
 */
export function ImportPanel({ kind }: { kind: 'debtors' | 'notes' }) {
  const [current, action, pending] = useActionState<ImportState, FormData>(
    importCsvAction.bind(null, kind),
    {},
  );
  const [archivo, setArchivo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const panel = PANEL[kind];
  const result = current.result;
  const blocking = (result?.issues ?? []).filter((issue) => issue.severity === 'error');
  const canCommit = Boolean(result && !result.committed && blocking.length === 0 && result.valid > 0);

  return (
    <section className="card flex flex-col p-4" aria-label={panel.titulo}>
      <div className="flex items-start gap-3">
        {/* El número no es adorno: el orden importa y equivocarse deja los
            pagarés sin deudor al que colgarse. */}
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent-ink"
          aria-hidden
        >
          {panel.paso}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{panel.titulo}</h2>
          <p className="mt-0.5 text-xs text-muted">{panel.porQue}</p>
        </div>
      </div>

      <details className="mt-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-ink-2 hover:text-ink">
          Qué columnas lleva el archivo
        </summary>
        <ul className="mt-2 space-y-1">
          {COLUMNAS[kind].map((columna) => (
            <li key={columna.nombre} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-mono text-ink">{columna.nombre}</span>
              {columna.obligatoria ? null : <span className="text-muted">(opcional)</span>}
              <span className="ml-auto font-mono text-[11px] text-muted">{columna.ejemplo}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">
          Separador coma o punto y coma. Fechas en AAAA-MM-DD o DD/MM/AAAA.
        </p>
      </details>

      <form action={action} className="mt-3 space-y-2">
        {/*
          El campo de archivo del navegador sale en inglés y con el aspecto del
          sistema operativo. Se oculta y se gobierna desde una etiqueta, que es
          un control de verdad para el teclado y para el lector de pantalla.
        */}
        <input
          ref={input}
          id={`archivo-${kind}`}
          type="file"
          name="file"
          accept=".csv,text/csv"
          required={!result}
          className="sr-only"
          onChange={(event) => setArchivo(event.target.files?.[0]?.name ?? null)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={`archivo-${kind}`}
            className="btn btn-secondary btn-sm cursor-pointer"
            // El clic en la etiqueta ya abre el diálogo; esto lo hace también
            // con Intro y Espacio, que es como lo abre quien no usa ratón.
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                input.current?.click();
              }
            }}
          >
            <NavIcon.document />
            {archivo ? 'Cambiar archivo' : 'Elegir archivo CSV'}
          </label>

          <a href={panel.plantilla} className="text-xs text-accent-ink underline hover:text-accent">
            Descargar plantilla
          </a>
        </div>

        <p className="truncate text-xs text-muted" aria-live="polite">
          {archivo ?? 'Ningún archivo elegido todavía.'}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            name="commit"
            value="off"
            disabled={pending || !archivo}
            className="btn btn-secondary btn-sm"
          >
            {pending ? 'Revisando…' : 'Revisar archivo'}
          </button>

          {/* Importar sólo aparece cuando la revisión salió limpia: es el paso
              que escribe, y no debe estar a un clic de distancia por descuido. */}
          {canCommit ? (
            <button
              type="submit"
              name="commit"
              value="on"
              disabled={pending}
              className="btn btn-primary btn-sm"
            >
              {pending ? 'Importando…' : `Importar ${plural(result?.valid ?? 0, 'fila', 'filas')}`}
            </button>
          ) : null}

          {!result ? (
            <span className="text-xs text-muted">Revisar no escribe nada todavía.</span>
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
