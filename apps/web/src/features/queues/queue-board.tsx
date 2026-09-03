import type { ReactNode } from 'react';
import { QueueSection, type QueueTone } from './queue-section';
import type { QueueItem } from './queries';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

export interface QueueDefinition {
  id: string;
  title: string;
  hint: string;
  empty: string;
  items: QueueItem[];
  icon: ReactNode;
  tone: QueueTone;
}

/**
 * La bandeja de trabajo (§19.2).
 *
 * Sólo se despliegan las colas **con trabajo dentro**. Las vacías se resumen en
 * una línea al final: seis tarjetas idénticas, cinco de ellas diciendo "no hay
 * nada", empujaban lo único que sí requería atención fuera de la pantalla.
 *
 * Las vacías no se ocultan del todo a propósito: saber que se revisaron y están
 * en cero es parte de la respuesta.
 */
export function QueueBoard({
  queues,
  organizationName,
}: {
  queues: QueueDefinition[];
  organizationName: string;
}) {
  const withWork = queues.filter((queue) => queue.items.length > 0);
  const clear = queues.filter((queue) => queue.items.length === 0);

  return (
    <div className="space-y-4">
      {withWork.map((queue) => (
        <QueueSection
          key={queue.id}
          id={queue.id}
          title={queue.title}
          hint={queue.hint}
          emptyLabel={queue.empty}
          items={queue.items}
          organizationName={organizationName}
          icon={queue.icon}
          tone={queue.tone}
        />
      ))}

      {clear.length > 0 ? (
        <section aria-label="Colas sin pendientes" className="card px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-ok-soft text-ok" aria-hidden>
                <NavIcon.check />
              </span>
              {withWork.length === 0 ? 'Todo al día' : 'Sin pendientes'}
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {clear.map((queue) => (
                <li key={queue.id}>
                  <span className="chip bg-surface-2 text-muted" title={queue.empty}>
                    {queue.title}
                    <span className="tnum ml-1 text-[11px]">0</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
