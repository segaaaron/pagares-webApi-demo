import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

/**
 * Cabecera de página. Una para toda la aplicación.
 *
 * Migas + título + acciones. Antes cada pantalla se inventaba la suya y las de
 * detalle abrían con un "← Pagarés" suelto, que es un enlace de vuelta, no una
 * navegación: no dice dónde estás, sólo de dónde vienes.
 *
 * Las migas siguen lo que pide WCAG (técnica G65): `<nav>` con etiqueta, lista
 * ordenada porque hay jerarquía, y la página actual **no es enlace** —lleva
 * `aria-current="page"`, que es lo que anuncia el lector de pantalla.
 */
export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  crumbs = [],
  title,
  badge,
  description,
  actions,
  meta,
}: {
  crumbs?: Crumb[];
  title: string;
  /** Chip a la derecha del título: estado, folio, lo que identifique. */
  badge?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Dato a la derecha, en la línea de las migas (fecha de corte, contador). */
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {crumbs.length > 0 ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <nav aria-label="Migas de pan">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
              <li>
                <Link
                  href="/"
                  className="inline-flex items-center rounded p-0.5 hover:text-ink"
                  aria-label="Panel"
                >
                  <NavIcon.panel />
                </Link>
              </li>
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return (
                  <li key={crumb.label} className="flex items-center gap-1">
                    <span aria-hidden className="text-line-strong">
                      <NavIcon.chevronRight />
                    </span>
                    {crumb.href && !last ? (
                      <Link href={crumb.href} className="rounded px-0.5 hover:text-ink hover:underline">
                        {crumb.label}
                      </Link>
                    ) : (
                      // La página actual no es enlace: ya estás en ella.
                      <span aria-current="page" className="px-0.5 font-medium text-ink-2">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          {meta ? <div className="shrink-0">{meta}</div> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1>{title}</h1>
            {badge}
          </div>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
