import type { ReactNode } from 'react';
import { PagareFacsimile } from '@/shared/ui/pagare-facsimile';

/**
 * Marco de las pantallas sin sesión: acceso, cambio obligatorio y recuperación.
 *
 * Vive en un solo componente porque las tres son el mismo sitio para quien las
 * usa; tenerlo copiado tres veces es cómo el panel de marca acaba diciendo cosas
 * distintas según por dónde entres.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca. Decorativo, así que se oculta al lector de pantalla:
          lo que importa —el nombre— también está sobre el formulario. */}
      <section
        aria-hidden
        className="relative hidden overflow-hidden bg-accent-ink px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between"
      >
        {/* Trama de papel pautado: da textura sin cargar una sola imagen. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 28px)',
          }}
        />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/70">
            Créditos Morelia
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold">Pagarés</p>
        </div>

        <div className="relative max-w-lg">
          {/* El documento del que trata todo esto, para no tener que explicarlo. */}
          <PagareFacsimile className="mb-9 w-full max-w-md -rotate-2" />

          <p className="font-serif text-2xl leading-snug">
            Cada pagaré, su saldo y su fecha. En un solo lugar y con nombre y apellido de quién
            tocó qué.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-white/75">
            <li>Emisión, firma y cobranza en el mismo expediente.</li>
            <li>Abonos que se anulan con motivo, nunca se borran.</li>
            <li>Bitácora encadenada: si algo se altera, se nota.</li>
          </ul>
        </div>

        <p className="relative font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">
          Morelia, Michoacán · México
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-ink lg:hidden">
              Créditos Morelia
            </p>
            <h1 className="mt-1 text-ink">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{description}</p>
          </div>
          {children}
          {footer ? <div className="mt-6 text-xs leading-relaxed text-muted">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}
