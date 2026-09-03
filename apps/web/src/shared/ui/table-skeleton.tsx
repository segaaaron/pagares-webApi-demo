/** Esqueleto de carga: la pantalla no salta cuando llegan los datos (§19.3). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="overflow-hidden card"
      role="status"
      aria-label="Cargando pagarés"
    >
      <div className="h-9 border-b border-line-strong bg-surface-2" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-3 py-3 last:border-0">
          <div className="h-3 w-24 rounded bg-surface-2" />
          <div className="h-3 w-40 rounded bg-surface-2" />
          <div className="ml-auto h-3 w-24 rounded bg-surface-2" />
          <div className="h-3 w-20 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
