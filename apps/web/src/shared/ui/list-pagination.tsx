import Link from 'next/link';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

/**
 * Pie de tabla para listas que llegan completas del servidor (deudores,
 * accesos, filas de un reporte).
 *
 * La cartera pagina por cursor porque puede tener decenas de miles de filas;
 * estas otras caben en una consulta, así que paginarlas por número de página
 * es más simple y da lo mismo. Lo que **no** cambia es el aspecto del pie:
 * es el mismo componente visual en las dos, para que no haya dos paginadores
 * distintos en la misma aplicación.
 */
/** 15 llena la pantalla sin obligar a bajar; los otros dos son para revisar. */
export const PAGE_SIZES = [15, 30, 60] as const;

export function paginate<T>(rows: T[], searchParams: URLSearchParams): {
  page: T[];
  props: { total: number; from: number; size: number; current: number; pages: number };
} {
  const size = Number(searchParams.get('tam') ?? 15);
  const valid = PAGE_SIZES.includes(size as (typeof PAGE_SIZES)[number]) ? size : 15;
  const pages = Math.max(1, Math.ceil(rows.length / valid));
  const current = Math.min(Math.max(1, Number(searchParams.get('p') ?? 1)), pages);
  const from = (current - 1) * valid;

  return {
    page: rows.slice(from, from + valid),
    props: { total: rows.length, from, size: valid, current, pages },
  };
}

export function ListPagination({
  basePath,
  params,
  total,
  from,
  shown,
  size,
  current,
  pages,
  noun = ['registro', 'registros'],
}: {
  basePath: string;
  params: URLSearchParams;
  total: number;
  from: number;
  shown: number;
  size: number;
  current: number;
  pages: number;
  noun?: [string, string];
}) {
  const href = (page: number, tam = size): string => {
    const next = new URLSearchParams(params);
    next.set('p', String(page));
    next.set('tam', String(tam));
    return `${basePath}?${next.toString()}`;
  };

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-2.5"
    >
      <p className="tnum text-xs text-muted">
        <span className="font-medium text-ink">
          {shown === 0 ? 0 : `${from + 1}–${from + shown}`}
        </span>{' '}
        de {total} {total === 1 ? noun[0] : noun[1]}
      </p>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-xs text-muted">
          Por página:
          {PAGE_SIZES.map((option) => (
            <Link
              key={option}
              href={href(1, option)}
              aria-current={size === option ? 'true' : undefined}
              className={`tnum rounded px-1.5 py-0.5 ${
                size === option ? 'bg-accent-soft font-semibold text-accent-ink' : 'hover:text-ink'
              }`}
            >
              {option}
            </Link>
          ))}
        </span>

        <div className="flex items-center gap-2">
          <Step href={href(current - 1)} disabled={current <= 1} label="Anterior" icon="left" />
          <span className="tnum text-xs text-muted">
            {current} / {pages}
          </span>
          <Step href={href(current + 1)} disabled={current >= pages} label="Siguiente" icon="right" />
        </div>
      </div>
    </nav>
  );
}

function Step({
  href,
  disabled,
  label,
  icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: 'left' | 'right';
}) {
  const content = (
    <>
      {icon === 'left' ? <NavIcon.chevronLeft /> : null}
      {label}
      {icon === 'right' ? <NavIcon.chevronRight /> : null}
    </>
  );

  // Deshabilitado se ve, no se esconde: así el pie no cambia de tamaño al pasar
  // de página y se entiende que ya no hay más.
  return disabled ? (
    <span aria-disabled className="btn btn-secondary btn-sm opacity-50">
      {content}
    </span>
  ) : (
    <Link href={href} className="btn btn-secondary btn-sm">
      {content}
    </Link>
  );
}
