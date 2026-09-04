import { CreateUserForm } from '@/features/users/user-forms';
import { RouteNotice } from '@/shared/ui/route-notice';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, ApiError } from '@/shared/api/client';
import { STATUS_PRESENTATION, type NoteStatus } from '@/entities/note/status';
import { shortDate } from '@/shared/lib/format';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { Money } from '@/shared/ui/money';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { PageHeader } from '@/shared/ui/page-header';
import { StatCard } from '@/shared/ui/stat-card';

interface DebtorDetail {
  id: string;
  fullName: string;
  address: string;
  phone: string;
  email: string | null;
  hasAccount: boolean;
  notes: {
    id: string;
    folio: string;
    status: NoteStatus;
    amount: string;
    balance: string;
    dueDate: string;
  }[];
}

/**
 * Ficha del deudor (§19.8).
 *
 * Contesta lo que se pregunta antes de llamar a alguien: cuánto debe en total,
 * cuántos pagarés tiene vivos, cuántos vencidos y cómo contactarlo. La lista de
 * la cartera responde por pagaré; ésta, por persona.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const debtor = await api<DebtorDetail>(`/admin/debtors/${id}`);
    return { title: debtor.fullName };
  } catch {
    return { title: 'Deudor' };
  }
}


/** Motivos con los que una descarga devuelve al administrador a esta pantalla. */
const AVISOS: Record<string, { tone: 'warning' | 'error'; message: string }> = {
  'documento-desconocido': { tone: 'error', message: 'Ese documento no existe.' },
  'estado-cuenta-fallido': {
    tone: 'error',
    message: 'No se pudo generar el estado de cuenta. Inténtalo de nuevo en un momento.',
  },
};

export default async function DebtorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const consulta = await searchParams;
  const aviso = typeof consulta['aviso'] === 'string' ? AVISOS[consulta['aviso']] : undefined;

  let debtor: DebtorDetail;
  try {
    debtor = await api<DebtorDetail>(`/admin/debtors/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const open = debtor.notes.filter((note) => !['PAID', 'VOID', 'RENEWED'].includes(note.status));
  const overdue = open.filter((note) => note.status === 'OVERDUE');
  const settled = debtor.notes.filter((note) => note.status === 'PAID');
  const totalBalance = open.reduce((sum, note) => sum + toCents(note.balance), 0);

  const columns: Column<DebtorDetail['notes'][number]>[] = [
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
    { key: 'amount', header: 'Importe', align: 'right', cell: (note) => <Money value={note.amount} className="text-ink-2" /> },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      cell: (note) => <Money value={note.balance} className="font-semibold" />,
    },
    {
      key: 'due',
      header: 'Vence',
      width: '7.5rem',
      cell: (note) => <span className="tnum text-ink-2">{shortDate(note.dueDate)}</span>,
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
  ];

  return (
    <div className="space-y-5">
      {aviso ? <RouteNotice tone={aviso.tone} message={aviso.message} /> : null}
      <PageHeader
        crumbs={[{ label: 'Deudores', href: '/clientes' }, { label: debtor.fullName }]}
        title={debtor.fullName}
        badge={
          debtor.hasAccount ? (
            <span className="chip bg-ok-soft text-ok">Con cuenta</span>
          ) : (
            <span className="chip bg-surface-2 text-muted" title="Firma presencialmente; sus avisos son gestión manual">
              Sin cuenta
            </span>
          )
        }
        description={`${debtor.address} · ${debtor.phone}${debtor.email ? ` · ${debtor.email}` : ''}`}
        actions={
          <>
            {/* El mismo diálogo que en Accesos: un solo flujo para dar acceso,
                aquí con la persona ya puesta. */}
            {!debtor.hasAccount ? (
              <CreateUserForm
                debtor={{
                  id: debtor.id,
                  fullName: debtor.fullName,
                  phone: debtor.phone,
                  email: debtor.email,
                }}
                label="Dar acceso a la app"
              />
            ) : null}
            <a
              href={`/clientes/${debtor.id}/estado-cuenta`}
              target="_blank"
              rel="noopener"
              className="btn btn-secondary"
            >
              <NavIcon.download />
              Estado de cuenta
            </a>
            {/* Con el deudor puesto: venir desde su ficha y tener que buscarlo
                otra vez es teclear lo que el sistema ya sabe. */}
            <Link href={`/pagares/nuevo?deudor=${debtor.id}`} className="btn btn-primary">
              Nuevo pagaré
            </Link>
          </>
        }
      />

      <section aria-label="Resumen del deudor" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo por cobrar"
          value={formatCents(totalBalance)}
          detail={`${open.length} ${open.length === 1 ? 'pagaré vivo' : 'pagarés vivos'}`}
          icon={<NavIcon.portfolio />}
        />
        <StatCard
          label="Vencidos"
          value={String(overdue.length)}
          detail={overdue.length > 0 ? 'Requieren gestión' : 'Ninguno con atraso'}
          icon={<NavIcon.alert />}
          tone={overdue.length > 0 ? 'crit' : 'neutral'}
        />
        <StatCard
          label="Liquidados"
          value={String(settled.length)}
          detail="Pagados en su totalidad"
          icon={<NavIcon.check />}
          tone="ok"
        />
        <StatCard
          label="Comportamiento"
          value={overdue.length === 0 ? 'Puntual' : overdue.length > 1 ? 'Moroso' : 'Con atrasos'}
          detail="Se deriva del historial, no se captura"
          icon={<NavIcon.clients />}
          tone={overdue.length === 0 ? 'ok' : overdue.length > 1 ? 'crit' : 'warn'}
        />
      </section>

      <DataTable
        caption={`Pagarés de ${debtor.fullName}`}
        columns={columns}
        rows={debtor.notes}
        rowKey={(note) => note.id}
        rowStripe={(note) => STATUS_PRESENTATION[note.status].stripe}
        empty={<EmptyState title="Todavía no tiene pagarés" hint="Se le puede emitir el primero desde aquí." />}
      />
    </div>
  );
}

/** "$35,000.00 MXN" → 3500000. El importe llega formateado, no en centavos. */
function toCents(formatted: string): number {
  return Math.round(Number(formatted.replace(/[^\d.]/g, '')) * 100);
}

function formatCents(cents: number): string {
  return `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100)} MXN`;
}
