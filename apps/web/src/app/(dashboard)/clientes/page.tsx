import Link from 'next/link';
import { api } from '@/shared/api/client';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { ListPagination, paginate } from '@/shared/ui/list-pagination';
import { Money } from '@/shared/ui/money';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { ImportPanel } from '@/features/imports/import-panel';

export const metadata = { title: 'Deudores' };

interface DebtorRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  hasAccount: boolean;
  balance: string;
  activeCount: number;
  overdueCount: number;
  settledCount: number;
  behavior: 'puntual' | 'con atrasos' | 'moroso';
}

const BEHAVIOR: Record<string, string> = {
  puntual: 'bg-ok-soft text-ok',
  'con atrasos': 'bg-warn-soft text-warn',
  moroso: 'bg-crit-soft text-crit',
};

export default async function DebtorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  );
  const todos = await api<DebtorRow[]>('/admin/debtors');

  /**
   * Quién se quedó sin acceso a la aplicación.
   *
   * Al borrar una cuenta el deudor sigue aquí con sus pagarés, y sin este filtro
   * habría que ir abriendo fichas para encontrarlo. Es la entrada natural a
   * «devolverle el acceso» (§25.2).
   */
  const soloSinAcceso = params.get('acceso') === 'sin';
  const debtors = soloSinAcceso ? todos.filter((d) => !d.hasAccount) : todos;
  const sinAcceso = todos.filter((d) => !d.hasAccount).length;
  const { page, props } = paginate(debtors, params);

  const conFiltro = (valor: string | null): string => {
    const siguiente = new URLSearchParams(params);
    if (valor) siguiente.set('acceso', valor);
    else siguiente.delete('acceso');
    // El paginador guarda la página en `p`: sin borrarla, filtrar desde la
    // página 3 dejaba una lista vacía sin explicación.
    siguiente.delete('p');
    const consulta = siguiente.toString();
    return consulta ? `/clientes?${consulta}` : '/clientes';
  };

  const columns: Column<DebtorRow>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (d) => (
        <span className="flex items-center gap-2">
          <Link href={`/clientes/${d.id}`} className="font-medium text-ink hover:underline">
            {d.fullName}
          </Link>
          {!d.hasAccount ? (
            <span
              className="chip bg-surface-2 text-muted"
              title="Sin cuenta: firmará presencialmente y sus avisos son gestión manual"
            >
              Sin cuenta
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contacto',
      cell: (d) => (
        <span className="block text-xs">
          <a href={`tel:${d.phone}`} className="tnum text-ink-2 hover:underline">
            {d.phone}
          </a>
          <span className="block text-muted">{d.email ?? 'Sin correo'}</span>
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Saldo',
      align: 'right',
      cell: (d) => <Money value={d.balance} className="font-semibold" />,
    },
    { key: 'active', header: 'Vigentes', align: 'right', width: '6rem', cell: (d) => <span className="tnum">{d.activeCount}</span> },
    {
      key: 'overdue',
      header: 'Vencidos',
      align: 'right',
      width: '6rem',
      cell: (d) => (d.overdueCount > 0 ? <span className="tnum text-crit">{d.overdueCount}</span> : <span className="text-muted">—</span>),
    },
    {
      key: 'settled',
      header: 'Liquidados',
      align: 'right',
      width: '6.5rem',
      cell: (d) => <span className="tnum text-muted">{d.settledCount}</span>,
    },
    {
      key: 'behavior',
      header: 'Comportamiento',
      width: '9rem',
      cell: (d) => <span className={`chip ${BEHAVIOR[d.behavior]}`}>{d.behavior}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '11rem',
      cell: (d) => (
        <span className="flex justify-end gap-1.5">
          {/* Sus pagarés y su estado de cuenta: las dos cosas que se buscan
              desde el directorio, sin tener que ir a la cartera a filtrar. */}
          <Link href={`/clientes/${d.id}`} className="btn btn-secondary btn-sm">
            Ver ficha
          </Link>
          <a
            href={`/clientes/${d.id}/estado-cuenta`}
            target="_blank"
            rel="noopener"
            className="btn btn-ghost btn-sm"
            title="Estado de cuenta en PDF, al corte de hoy"
          >
            Estado
          </a>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Deudores' }]}
        title="Deudores"
        description="Quién debe y cuánto. El comportamiento se deriva del historial de pagos, no se captura."
        actions={
          sinAcceso > 0 ? (
            <Link
              href={conFiltro(soloSinAcceso ? null : 'sin')}
              className={`btn btn-sm ${soloSinAcceso ? 'btn-primary' : 'btn-secondary'}`}
              title="Deudores que no pueden entrar a la aplicación"
            >
              {soloSinAcceso ? 'Ver todos' : `Sin acceso (${sinAcceso})`}
            </Link>
          ) : null
        }
      />

      {/* La importación vive aquí porque el alta masiva es lo primero que se
          hace al empezar a usar el sistema con una cartera que ya existe (§24.5).
          Va plegada: se usa las primeras semanas y luego estorba todos los días. */}
      <details className="card p-4" open={debtors.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Importar cartera desde un archivo
          <span className="ml-2 font-normal text-muted">
            Dos pasos, en orden: primero los deudores y después sus pagarés.
          </span>
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ImportPanel kind="debtors" />
          <ImportPanel kind="notes" />
        </div>
      </details>

      <DataTable
        caption="Deudores con su saldo y su comportamiento de pago"
        columns={columns}
        rows={page}
        rowKey={(d) => d.id}
        empty={<EmptyState title="Todavía no hay deudores" hint="Se dan de alta al emitir el primer pagaré." />}
        footer={
          <ListPagination
            basePath="/clientes"
            params={params}
            shown={page.length}
            noun={['deudor', 'deudores']}
            {...props}
          />
        }
      />
    </div>
  );
}
