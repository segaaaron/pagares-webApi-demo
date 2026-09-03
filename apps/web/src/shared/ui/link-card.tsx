import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

/**
 * Tarjeta que lleva a algún sitio: icono, título, una línea de qué contesta y
 * la flecha que dice que es pulsable.
 *
 * Vive aquí porque la usan el índice de reportes y las pantallas de atajos; una
 * tarjeta-enlace por pantalla es como acabas con cinco tarjetas distintas.
 */
export function LinkCard({
  href,
  title,
  description,
  icon,
  meta,
  download = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  /** Cifra o etiqueta a la derecha del título, cuando aporta contexto. */
  meta?: string;
  /** Descarga un archivo en vez de navegar; cambia la flecha por el icono. */
  download?: boolean;
}) {
  const className =
    'card card-interactive group flex items-start gap-3 px-4 py-3.5 transition-all hover:-translate-y-px active:translate-y-0 active:shadow-[var(--shadow-card)]';

  const body = (
    <>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {meta ? <span className="tnum shrink-0 text-xs text-muted">{meta}</span> : null}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
      </span>
      <span className="mt-1 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden>
        {download ? <NavIcon.download /> : <NavIcon.chevronRight />}
      </span>
    </>
  );

  // Una descarga no es una navegación: va en `<a>` y abre en otra pestaña, para
  // que la página desde la que se pidió siga donde estaba.
  return download ? (
    <a href={href} target="_blank" rel="noopener" className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
