import Link from 'next/link';
import type { NoteSummary } from '@pagares/contracts';
import { STATUS_PRESENTATION } from '@/entities/note/status';
import { shortDate } from '@/shared/lib/format';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Money } from '@/shared/ui/money';

/**
 * La cartera (§19.3). Columnas elegidas por lo que hay que comparar de un
 * vistazo —saldo y días de atraso—, no por lo que la base guarda.
 *
 * El aspecto lo pone `DataTable`, que es la misma tabla de todas las pantallas;
 * aquí sólo se declara qué columnas hay y qué va en cada celda.
 */
export function NotesTable({
  notes,
  params,
  sort,
  footer,
}: {
  notes: NoteSummary[];
  params: URLSearchParams;
  sort: string;
  footer: React.ReactNode;
}) {
  const sortHref = (id: string): string => {
    const next = new URLSearchParams(params);
    next.set('orden', id);
    next.delete('cursor');
    next.delete('hist');
    return `/pagares?${next.toString()}`;
  };

  const columns: Column<NoteSummary>[] = [
    {
      key: 'folio',
      header: 'Folio',
      width: '9.5rem',
      cell: (note) => (
        <Link href={`/pagares/${note.id}`} className="font-mono text-xs text-accent-ink hover:underline">
          {note.folio}
        </Link>
      ),
    },
    {
      key: 'debtor',
      header: 'Deudor',
      cell: (note) => <span className="font-medium text-ink">{note.debtorName}</span>,
    },
    {
      key: 'amount',
      header: 'Importe',
      align: 'right',
      cell: (note) => <Money value={note.amount.formatted} className="text-ink-2" />,
    },
    {
      key: 'paid',
      header: 'Abonado',
      align: 'right',
      cell: (note) => <Money value={note.paid.formatted} className="text-muted" />,
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      cell: (note) => <Money value={note.balance.formatted} className="font-semibold" />,
      sort: { href: sortHref('saldo'), active: sort === 'saldo', direction: 'desc' },
    },
    {
      key: 'due',
      header: 'Vence',
      width: '7.5rem',
      cell: (note) => <span className="tnum text-ink-2">{shortDate(note.dueDate)}</span>,
      sort: { href: sortHref('vencimiento'), active: sort === 'vencimiento', direction: 'asc' },
    },
    {
      key: 'overdue',
      header: 'Atraso',
      align: 'right',
      width: '5.5rem',
      cell: (note) =>
        note.daysOverdue > 0 ? (
          <span className="tnum text-crit">{note.daysOverdue} d</span>
        ) : (
          <span className="text-muted">—</span>
        ),
      sort: { href: sortHref('atraso'), active: sort === 'atraso', direction: 'desc' },
    },
    {
      key: 'status',
      header: 'Estado',
      width: '8.5rem',
      cell: (note) => {
        const presentation = STATUS_PRESENTATION[note.status];
        return (
          <span className={`chip ${presentation.chip}`} title={presentation.description}>
            {presentation.label}
          </span>
        );
      },
    },
    {
      key: 'signature',
      header: 'Firma',
      width: '6rem',
      cell: (note) =>
        note.signatureThumbUrl ? (
          // Etiqueta nativa a propósito: la URL viene prefirmada y caduca en 15
          // minutos, así que optimizarla y cachearla no aporta nada.
          <img
            src={note.signatureThumbUrl}
            alt={`Firma del pagaré ${note.folio}`}
            className="h-6 w-auto"
            loading="lazy"
          />
        ) : (
          <span className="text-xs text-muted">Sin firma</span>
        ),
    },
  ];

  return (
    <DataTable
      caption="Pagarés ordenados por vencimiento, del más próximo al más lejano"
      columns={columns}
      rows={notes}
      rowKey={(note) => note.id}
      // La franja repite el estado por forma y posición, no sólo por color.
      rowStripe={(note) => STATUS_PRESENTATION[note.status].stripe}
      empty={
        <EmptyState
          title="No hay pagarés con estos filtros"
          hint="Cambia el estado o limpia la búsqueda."
        />
      }
      footer={footer}
    />
  );
}
