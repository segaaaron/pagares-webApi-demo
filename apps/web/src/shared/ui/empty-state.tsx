import type { ReactNode } from 'react';
import { NavIcon } from './icons/nav-icons';

/**
 * Estado vacío con icono, explicación y acción (§19.3).
 *
 * Una tabla en blanco sin explicación es un defecto: el usuario no sabe si no
 * hay datos, si el filtro está mal o si algo falló.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 card px-6 py-14 text-center">
      <span className="text-line-strong">
        <NavIcon.document />
      </span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        {hint ? <p className="mt-1 max-w-prose text-sm text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
