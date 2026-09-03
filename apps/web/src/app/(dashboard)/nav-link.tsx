'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Enlace del menú con su estado activo. Necesita la ruta actual, así que es lo
 * único del layout que corre en el cliente; el resto del menú sigue en servidor.
 *
 * El activo se marca por fondo **y** por peso de texto: si el usuario no
 * distingue el verde, el grosor se lo dice igual (§19.9).
 */
export function NavLink({
  href,
  hint,
  children,
}: {
  href: string;
  hint: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // "/" sólo coincide consigo mismo; las demás también con sus subrutas
  // (`/pagares/PAG-1` mantiene "Pagarés" marcado).
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      title={hint}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'relative flex h-10 items-center gap-3 rounded-lg bg-accent-soft px-3 text-sm font-semibold text-accent-ink before:absolute before:left-0 before:top-2 before:h-6 before:w-1 before:rounded-r before:bg-accent'
          : 'flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-ink-2 transition-colors hover:bg-accent-soft/60 hover:text-ink'
      }
    >
      {children}
    </Link>
  );
}
