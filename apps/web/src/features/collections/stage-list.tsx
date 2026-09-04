import Link from 'next/link';
import { listNotes } from '@/features/notes/queries';
import { todayInBusinessZone } from '@/shared/lib/today';
import { CollectionRow, type FilaCobranza } from './collection-row';

/**
 * Los pagarés de una etapa, con la gestión al alcance.
 *
 * §19.7 pide que desde Cobranza se registre gestión, no que se salga a buscarla:
 * el embudo sin lista es un tablero de cifras y quien tiene que llamar acaba
 * volviendo a la cartera y perdiendo el hilo de por dónde iba.
 */
const ETAPAS: Record<string, { label: string; buckets: string[]; sugerencia: string }> = {
  PREVENTIVA: {
    label: 'Preventiva',
    buckets: ['CURRENT'],
    sugerencia: 'Recordar antes de que venza.',
  },
  ADMINISTRATIVA: {
    label: 'Administrativa',
    buckets: ['D1_30'],
    sugerencia: 'Llamar y dejar registrada la gestión.',
  },
  EXTRAJUDICIAL: {
    label: 'Extrajudicial',
    buckets: ['D31_60', 'D61_90'],
    sugerencia: 'Negociar convenio o quita antes de escalar.',
  },
  JUDICIAL: {
    label: 'Judicial',
    buckets: ['D91_120', 'D120_PLUS'],
    sugerencia: 'Valorar demanda antes de que prescriba. Hace falta el pagaré original en papel.',
  },
};

export async function StageList({ stageId }: { stageId: string }) {
  const etapa = ETAPAS[stageId];
  if (!etapa) return null;

  // Una etapa puede abarcar dos tramos; se consultan y se juntan por vencimiento.
  const paginas = await Promise.all(
    etapa.buckets.map((bucket) => {
      const params = new URLSearchParams({ tab: 'todos', bucket, limit: '25' });
      return listNotes(params);
    }),
  );

  const filas: FilaCobranza[] = paginas
    .flatMap((pagina) => pagina.data)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .map((nota) => ({
      noteId: nota.id,
      folio: nota.folio,
      debtorName: nota.debtorName,
      debtorPhone: nota.debtorPhone,
      balance: nota.balance.formatted,
      dueDate: nota.dueDate,
      daysOverdue: nota.daysOverdue,
    }));

  const hoy = todayInBusinessZone();

  return (
    <section aria-label={`Pagarés en etapa ${etapa.label}`} className="card overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Etapa {etapa.label}</h2>
          <p className="text-xs text-muted">{etapa.sugerencia}</p>
        </div>
        <span className="tnum text-xs text-muted">
          {filas.length} {filas.length === 1 ? 'pagaré' : 'pagarés'}
        </span>
      </header>

      {filas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">
          Nada en esta etapa. Es la buena noticia del día.
        </p>
      ) : (
        <ul>
          {filas.map((fila) => (
            <CollectionRow key={fila.noteId} fila={fila} hoy={hoy} />
          ))}
        </ul>
      )}

      <footer className="border-t border-line px-4 py-2.5 text-xs text-muted">
        <Link href={`/pagares?bucket=${etapa.buckets[0]}`} className="text-accent-ink hover:underline">
          Ver esta etapa en la cartera
        </Link>
        {' · aquí sólo salen los 25 más atrasados de cada tramo.'}
      </footer>
    </section>
  );
}
