import Link from 'next/link';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

/**
 * Paginación por cursor (§14.3: nada de `OFFSET`).
 *
 * Un cursor sabe ir hacia delante, no hacia atrás, así que la vuelta se
 * resuelve guardando en la URL los cursores ya visitados (`hist`). Volver es
 * quitar el último: no hay estado en el servidor y el botón atrás del
 * navegador sigue funcionando.
 */
/** Centinela de "primera página": la única que no tiene cursor propio. */
const FIRST_PAGE = '.';

export function Pagination({
  basePath,
  params,
  nextCursor,
  shown,
  total,
  pageSize,
  overdue = 0,
}: {
  basePath: string;
  params: URLSearchParams;
  nextCursor: string | null;
  shown: number;
  total: number;
  pageSize: number;
  /** Cuántos de los mostrados están vencidos; se dice aquí y no en otra línea. */
  overdue?: number;
}) {
  const history = (params.get('hist') ?? '').split('~').filter(Boolean);
  const current = params.get('cursor');

  const href = (cursor: string | null, hist: string[]): string => {
    const next = new URLSearchParams(params);
    next.delete('cursor');
    next.delete('hist');
    if (cursor) next.set('cursor', cursor);
    if (hist.length > 0) next.set('hist', hist.join('~'));
    const query = next.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  // El cursor no sabe en qué página va, pero el historial sí: cada salto que
  // se guardó es una página completa que quedó atrás.
  const from = history.length * pageSize + 1;
  // La primera página no tiene cursor, así que se apunta con un centinela:
  // sin él, volver a ella desde la segunda no se distingue de "no hay atrás".
  const last = history.at(-1) ?? null;
  const previous = last === FIRST_PAGE ? null : last;
  const hasPrevious = current !== null;

  const sizeHref = (size: number): string => {
    const next = new URLSearchParams(params);
    next.set('limit', String(size));
    next.delete('cursor');
    next.delete('hist');
    return `${basePath}?${next.toString()}`;
  };

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-2.5"
    >
      <p className="tnum text-xs text-muted">
        {/* Nunca "página 3 de ?": el total siempre se dice. */}
        <span className="font-medium text-ink">
          {shown === 0 ? 0 : `${from}–${from + shown - 1}`}
        </span>{' '}
        de {total} {total === 1 ? 'pagaré' : 'pagarés'}
        {overdue > 0 ? (
          <>
            {' · '}
            <span className="text-crit">
              {overdue} {overdue === 1 ? 'vencido' : 'vencidos'}
            </span>
          </>
        ) : null}
      </p>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-xs text-muted">
          Por página:
          {[15, 30, 60].map((size) => (
            <Link
              key={size}
              href={sizeHref(size)}
              aria-current={pageSize === size ? 'true' : undefined}
              className={`tnum rounded px-1.5 py-0.5 ${
                pageSize === size ? 'bg-accent-soft font-semibold text-accent-ink' : 'hover:text-ink'
              }`}
            >
              {size}
            </Link>
          ))}
        </span>
        <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Link href={href(previous, history.slice(0, -1))} className="btn btn-secondary btn-sm">
            <NavIcon.chevronLeft />
            Anterior
          </Link>
        ) : (
          <span aria-disabled className="btn btn-secondary btn-sm opacity-50">
            <NavIcon.chevronLeft />
            Anterior
          </span>
        )}
        {nextCursor ? (
          <Link
            href={href(nextCursor, [...history, current ?? FIRST_PAGE])}
            className="btn btn-secondary btn-sm"
          >
            Siguiente
            <NavIcon.chevronRight />
          </Link>
        ) : (
          <span aria-disabled className="btn btn-secondary btn-sm opacity-50">
            Siguiente
            <NavIcon.chevronRight />
          </span>
        )}
        </div>
      </div>
    </nav>
  );
}
