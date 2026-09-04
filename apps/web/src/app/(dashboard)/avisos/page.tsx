import { getNotifications, eventLabel, type NotificationRow } from '@/features/notifications/queries';
import { RetryAllButton, RetryOneButton } from '@/features/notifications/notification-actions';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { dateTime } from '@/shared/lib/format';

export const metadata = { title: 'Avisos · Pagarés' };

/**
 * Avisos que no salieron (§18.1).
 *
 * El correo se manda al cerrar cada operación, así que un proveedor caído no
 * interrumpe nada —y por eso mismo puede pasar horas sin que nadie lo note—.
 * Esta pantalla es la que lo hace visible, y el botón de reintentar es lo que
 * evita tener que tocar la base de datos para recuperar un correo perdido.
 */
export default async function AvisosPage() {
  const { stuck, pending, counts } = await getNotifications();

  const columnas = (conReintento: boolean): Column<NotificationRow>[] => [
    {
      key: 'evento',
      header: 'Aviso',
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{eventLabel(row.eventType)}</p>
          <p className="truncate text-xs text-muted">{row.recipient ?? 'Destinatario en el evento'}</p>
        </div>
      ),
    },
    {
      key: 'creado',
      header: 'Generado',
      width: '11rem',
      cell: (row) => <span className="tnum text-sm text-ink-2">{dateTime(row.createdAt)}</span>,
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
      cell: (row) =>
        row.lastError ? (
          // El motivo entero, sin recortar: «dominio no verificado» y «clave
          // inválida» se arreglan en sitios distintos.
          <span className="text-xs text-crit">{row.lastError}</span>
        ) : (
          <span className="text-xs text-muted">Todavía no se ha intentado</span>
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
        actions={counts.stuck > 0 ? <RetryAllButton count={counts.stuck} /> : null}
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
