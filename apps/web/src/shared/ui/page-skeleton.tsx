/**
 * Esqueleto de una pantalla mientras llegan sus datos.
 *
 * Con la forma de lo que viene, no con un velo por encima: tapar la pantalla
 * esconde también lo que ya estaba listo y deja al administrador esperando sin
 * saber ante qué. Aquí el título y la barra siguen en su sitio y sólo el
 * contenido está en gris, así que cuando llega no salta nada de posición.
 *
 * La animación se apaga si el sistema pide menos movimiento.
 */
export function PageSkeleton({
  cards = 0,
  rows = 6,
  label = 'Cargando',
}: {
  cards?: number;
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-5 motion-safe:animate-pulse" role="status" aria-label={label}>
      <div className="space-y-2">
        <div className="h-7 w-56 rounded bg-surface-2" />
        <div className="h-4 w-80 rounded bg-surface-2" />
      </div>

      {cards > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="card space-y-3 p-4">
              <div className="h-3 w-28 rounded bg-surface-2" />
              <div className="h-8 w-32 rounded bg-surface-2" />
              <div className="h-3 w-40 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      ) : null}

      {rows > 0 ? (
        <div className="card overflow-hidden">
          <div className="h-9 border-b border-line-strong bg-surface-2" />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-line px-3 py-3 last:border-0">
              <div className="h-3 w-24 rounded bg-surface-2" />
              <div className="h-3 w-44 rounded bg-surface-2" />
              <div className="ml-auto h-3 w-24 rounded bg-surface-2" />
              <div className="h-3 w-16 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      ) : null}

      <span className="sr-only">{label}…</span>
    </div>
  );
}
