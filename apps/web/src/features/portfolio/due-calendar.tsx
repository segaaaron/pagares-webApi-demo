import Link from 'next/link';
import { listNotes } from '@/features/notes/queries';
import { todayInBusinessZone } from '@/shared/lib/today';

/**
 * Calendario de vencimientos (§19.7).
 *
 * La antigüedad mira hacia atrás: lo que ya se debe. Esto mira hacia delante, y
 * es la diferencia entre cobrar y perseguir — el que sabe qué vence el jueves
 * llama el miércoles.
 *
 * Cuatro semanas: más allá el detalle deja de mover una decisión de hoy.
 */
const SEMANAS = 4;
const DIA_MS = 24 * 60 * 60 * 1000;

export async function DueCalendar() {
  const hoy = todayInBusinessZone();
  const desde = new Date(`${hoy}T00:00:00Z`);
  const hasta = new Date(desde.getTime() + SEMANAS * 7 * DIA_MS);

  const params = new URLSearchParams({
    tab: 'todos',
    dueFrom: hoy,
    dueTo: hasta.toISOString().slice(0, 10),
    limit: '100',
  });
  const pagina = await listNotes(params);

  // Sólo lo que sigue vivo: un pagaré pagado o anulado no vence.
  const vivos = pagina.data.filter((n) => n.balance.cents !== '0');

  const semanas = Array.from({ length: SEMANAS }, (_, i) => {
    const inicio = new Date(desde.getTime() + i * 7 * DIA_MS);
    const fin = new Date(inicio.getTime() + 6 * DIA_MS);
    const dentro = vivos.filter((n) => {
      const vence = new Date(`${n.dueDate}T00:00:00Z`);
      return vence >= inicio && vence <= fin;
    });
    return {
      inicio: inicio.toISOString().slice(0, 10),
      fin: fin.toISOString().slice(0, 10),
      etiqueta: i === 0 ? 'Esta semana' : i === 1 ? 'La que viene' : `En ${i} semanas`,
      cuenta: dentro.length,
      centavos: dentro.reduce((suma, n) => suma + BigInt(n.balance.cents), 0n),
    };
  });

  const mayor = semanas.reduce((max, s) => (s.centavos > max ? s.centavos : max), 1n);
  const mxn = (centavos: bigint): string =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
      Number(centavos) / 100,
    );

  return (
    <section aria-label="Calendario de vencimientos" className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Vence en las próximas cuatro semanas</h2>
        <span className="tnum text-xs text-muted">
          {vivos.length} {vivos.length === 1 ? 'pagaré' : 'pagarés'}
        </span>
      </div>

      <ul className="mt-3 space-y-2.5">
        {semanas.map((semana) => (
          <li key={semana.inicio}>
            <Link
              href={`/pagares?dueFrom=${semana.inicio}&dueTo=${semana.fin}`}
              className="group block rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink group-hover:underline">{semana.etiqueta}</span>
                <span className="tnum font-semibold text-ink">{mxn(semana.centavos)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${semana.centavos === 0n ? 0 : Math.max(Number((semana.centavos * 100n) / mayor), 3)}%`,
                  }}
                />
              </div>
              <p className="tnum mt-1 text-[11px] text-muted">
                {semana.cuenta} {semana.cuenta === 1 ? 'pagaré' : 'pagarés'} · del {semana.inicio} al{' '}
                {semana.fin}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {vivos.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nada vence en las próximas cuatro semanas.</p>
      ) : null}
    </section>
  );
}
