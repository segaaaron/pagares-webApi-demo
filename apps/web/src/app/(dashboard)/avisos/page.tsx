import {
  getNotifications,
  eventLabel,
  type NotificationRow,
  type FailureGroup,
} from '@/features/notifications/queries';
import { RetryAllButton, RetryOneButton } from '@/features/notifications/notification-actions';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { dateTime } from '@/shared/lib/format';

export const metadata = { title: 'Avisos · Pagarés' };

/**
 * Avisos que no salieron (§18.1).
 *
 * El correo se manda al cerrar cada operación, así que un proveedor caído no
 * interrumpe nada —y por eso mismo puede pasar horas sin que nadie lo note—.
 * Esta pantalla lo hace visible, y responde las dos preguntas que uno se hace al
 * abrirla: **a quién no le llegó** y **qué hay que arreglar** para que llegue.
 */
export default async function AvisosPage() {
  const { stuck, pending, counts, causes } = await getNotifications();

  /*
   * La acción («verifica el dominio», «revisa MAIL_DRIVER») se repite en el
   * resumen de arriba. Sólo se baja a la fila cuando hay más de un motivo en
   * pantalla: entonces sí hace falta saber cuál le toca a cada aviso.
   */
  const explicarPorFila = causes.length > 1;

  const columnas = (conReintento: boolean): Column<NotificationRow>[] => [
    {
      key: 'evento',
      header: 'Aviso',
      width: '13rem',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{eventLabel(row.eventType)}</p>
          {row.folio ? (
            <p className="tnum font-mono text-[11px] text-muted">{row.folio}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'destinatario',
      header: 'No le llegó a',
      cell: (row) =>
        row.recipient ? (
          <div className="min-w-0">
            {row.recipientName ? (
              <p className="truncate text-sm text-ink">{row.recipientName}</p>
            ) : null}
            <p className="truncate text-xs text-muted">{row.recipient}</p>
          </div>
        ) : (
          // Sin correo no hay a quién avisar, y ése es el problema, no un dato
          // que falte: se dice con todas las letras (§25.12).
          <span className="text-xs text-warn">Esta cuenta no tiene correo</span>
        ),
    },
    {
      key: 'creado',
      header: 'Generado',
      width: '10rem',
      cell: (row) => <span className="tnum text-xs text-ink-2">{dateTime(row.createdAt)}</span>,
    },
    {
      key: 'intentos',
      header: 'Intentos',
      align: 'right',
      width: '5rem',
      cell: (row) => <span className="tnum text-sm">{row.attempts}</span>,
    },
    {
      key: 'motivo',
      header: 'Por qué no salió',
      cell: (row) => (
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-crit">
            {row.failure.title}
            {row.failure.detail ? (
              <span className="font-mono text-xs font-normal"> · {row.failure.detail}</span>
            ) : null}
          </p>
          {explicarPorFila ? <p className="text-xs text-ink-2">{row.failure.action}</p> : null}
          {row.lastError ? (
            // El texto del proveedor no desaparece: se pliega. Es lo que hace
            // falta para investigar, y estorba para decidir.
            <details className="text-xs">
              <summary className="cursor-pointer text-muted hover:text-ink">
                Ver el error del proveedor
              </summary>
              <p className="mt-1 break-words font-mono text-[11px] text-muted">{row.lastError}</p>
            </details>
          ) : null}
        </div>
      ),
    },
    ...(conReintento
      ? [
          {
            key: 'accion',
            header: <span className="sr-only">Acciones</span>,
            align: 'right' as const,
            width: '8rem',
            cell: (row: NotificationRow) => <RetryOneButton id={row.id} />,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Avisos' }]}
        title="Avisos"
        description="Correos y notificaciones que aún no han llegado a su destinatario."
        actions={<RetryAllButton count={counts.stuck} />}
        meta={
          <span className="tnum text-xs text-muted">
            {counts.stuck} atascados · {counts.pending} en cola
          </span>
        }
      />

      {counts.stuck === 0 && counts.pending === 0 ? (
        <EmptyState
          title="Todo lo que se generó, salió"
          hint="Aquí aparecen los avisos que fallaron al enviarse. Que esté vacío significa que el correo está funcionando."
        />
      ) : (
        <div className="space-y-6">
          {causes.length > 0 ? <CausasResumen causes={causes} /> : null}

          {counts.stuck > 0 ? (
            <section className="space-y-2">
              <div>
                <h2 className="text-base font-semibold text-ink">Atascados</h2>
                <p className="text-sm text-muted">
                  Agotaron sus intentos: nadie los va a reenviar solo. Arregla la causa y reintenta.
                </p>
              </div>
              <DataTable
                caption="Avisos que agotaron sus intentos"
                columns={columnas(true)}
                rows={stuck}
                rowKey={(row) => row.id}
                rowStripe={() => 'bg-crit'}
                empty={null}
              />
            </section>
          ) : null}

          {counts.pending > 0 ? (
            <section className="space-y-2">
              <div>
                <h2 className="text-base font-semibold text-ink">En cola</h2>
                <p className="text-sm text-muted">
                  Todavía les quedan intentos: saldrán con la siguiente operación, sin hacer nada.
                </p>
              </div>
              <DataTable
                caption="Avisos pendientes de envío"
                columns={columnas(false)}
                rows={pending}
                rowKey={(row) => row.id}
                empty={null}
              />
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

/**
 * Los motivos, agrupados.
 *
 * Cinco filas con el mismo error son un problema, no cinco. Esto es lo que se
 * lee primero: cuántos avisos dependen de cada arreglo, y si reintentar sirve
 * de algo antes de hacerlo.
 */
function CausasResumen({ causes }: { causes: FailureGroup[] }) {
  return (
    <section aria-labelledby="causas-title" className="card p-4">
      <h2 id="causas-title" className="text-base font-semibold text-ink">
        {causes.length === 1 ? 'Todo falla por lo mismo' : `${causes.length} motivos distintos`}
      </h2>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {causes.map((causa) => (
          <li key={`${causa.code}-${causa.title}`} className="flex flex-wrap gap-x-3 gap-y-1 py-2.5">
            <span
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded ${
                causa.retryHelps ? 'bg-warn-soft text-warn' : 'bg-crit-soft text-crit'
              }`}
              aria-hidden
            >
              <NavIcon.alert />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{causa.title}</p>
              <p className="text-xs text-ink-2">{causa.action}</p>
            </div>
            <span className="tnum shrink-0 text-xs text-muted">
              {causa.count} {causa.count === 1 ? 'aviso' : 'avisos'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
