import Link from 'next/link';
import { DateField } from '@/shared/ui/date-field';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { TABS } from './tab-list';
import { StateFilter } from './state-filter';

/**
 * Filtros de la cartera (§19.3).
 *
 * Todo vive en la URL: el filtro se comparte por mensaje y el botón atrás
 * funciona. En estado del cliente se perderían las dos cosas.
 *
 * Tres bandas, de arriba abajo: las vistas, los campos y —sólo si hay algo
 * puesto— las fichas de lo que está aplicado, cada una con su aspa. Sin esas
 * fichas, un filtro de fechas puesto hace media hora explica una tabla vacía
 * y nadie sabe por qué.
 */
const SORTS = [
  { id: 'vencimiento', label: 'Vencimiento' },
  { id: 'saldo', label: 'Saldo' },
  { id: 'atraso', label: 'Atraso' },
] as const;

const BUCKET_LABELS: Record<string, string> = {
  CURRENT: 'Al corriente',
  D1_30: '1 a 30 días',
  D31_60: '31 a 60 días',
  D61_90: '61 a 90 días',
  D91_120: '91 a 120 días',
  D120_PLUS: 'Más de 120 días',
};

export function NotesFilters({ params }: { params: URLSearchParams }) {
  const active = params.get('tab') ?? 'todos';
  const sort = params.get('orden') ?? 'vencimiento';

  const withParam = (key: string, value: string): string => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    // Cambiar de filtro reinicia la paginación: el cursor era de otra lista.
    next.delete('cursor');
    next.delete('hist');
    return `/pagares?${next.toString()}`;
  };

  const without = (...keys: string[]): string => {
    const next = new URLSearchParams(params);
    for (const key of [...keys, 'cursor', 'hist']) next.delete(key);
    const query = next.toString();
    return query ? `/pagares?${query}` : '/pagares';
  };

  const chips: { label: string; href: string }[] = [];
  if (active !== 'todos') {
    const etiqueta = TABS.find((t) => t.id === active)?.label ?? active;
    chips.push({ label: `Estado: ${etiqueta}`, href: without('tab') });
  }
  const q = params.get('q');
  if (q) chips.push({ label: `Búsqueda: "${q}"`, href: without('q') });
  const bucket = params.get('bucket');
  if (bucket) chips.push({ label: `Tramo: ${BUCKET_LABELS[bucket] ?? bucket}`, href: without('bucket') });
  const from = params.get('desde');
  const to = params.get('hasta');
  if (from || to) {
    chips.push({
      label: `Emitidos ${from ? `desde ${civil(from)}` : ''}${from && to ? ' ' : ''}${to ? `hasta ${civil(to)}` : ''}`,
      href: without('desde', 'hasta'),
    });
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3 px-4 py-3.5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <StateFilter query={params.toString()} />

        <span className="mb-1 hidden h-9 w-px bg-line lg:block" aria-hidden />

        <form action="/pagares" method="get" className="flex items-end gap-2">
          <Hidden params={params} except={['q']} />
          <div>
            <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-ink">
              Buscar
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <NavIcon.search />
              </span>
              <input
                id="q"
                name="q"
                defaultValue={q ?? ''}
                placeholder="Folio, nombre o teléfono"
                className="input w-60 pl-9"
              />
            </div>
          </div>
          <button type="submit" className="btn btn-secondary">
            Buscar
          </button>
        </form>

        <span className="mb-1 hidden h-9 w-px bg-line lg:block" aria-hidden />

        <form action="/pagares" method="get" className="flex items-end gap-2">
          <Hidden params={params} except={['desde', 'hasta']} />
          {/* Calendario propio: el nativo se pinta en el idioma del navegador
              y escribiría mm/dd/aaaa en un Chrome en inglés. */}
          <DateField name="desde" label="Emitidos desde" defaultValue={from ?? ''} />
          <DateField name="hasta" label="Hasta" defaultValue={to ?? ''} />
          <button type="submit" className="btn btn-secondary">
            Aplicar
          </button>
        </form>

        <div className="ml-auto">
          <p className="mb-1.5 text-sm font-medium text-ink">Ordenar por</p>
          <div className="flex rounded-lg border border-line-strong bg-surface p-0.5">
            {SORTS.map((option) => (
              <Link
                key={option.id}
                href={withParam('orden', option.id)}
                aria-current={sort === option.id ? 'true' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  sort === option.id ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Filtros:</span>
          {chips.map((chip) => (
            <Link
              key={chip.label}
              href={chip.href}
              className="chip bg-surface text-ink-2 transition-colors hover:bg-crit-soft hover:text-crit"
              title="Quitar este filtro"
            >
              {chip.label}
              <span aria-hidden className="ml-0.5">
                ×
              </span>
              <span className="sr-only">Quitar</span>
            </Link>
          ))}
          <Link href={without('tab', 'q', 'bucket', 'desde', 'hasta')} className="text-xs text-accent-ink hover:underline">
            Limpiar todo
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Los filtros que no toca este formulario viajan escondidos, o se perderían. */
function Hidden({ params, except }: { params: URLSearchParams; except: string[] }) {
  const keep = ['tab', 'orden', 'q', 'bucket', 'desde', 'hasta'].filter((key) => !except.includes(key));
  return (
    <>
      {keep.map((key) => {
        const value = params.get(key);
        return value ? <input key={key} type="hidden" name={key} value={value} /> : null;
      })}
    </>
  );
}

/** `2026-03-14` → `14/03/2026`, que es como se escriben las fechas aquí. */
function civil(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
