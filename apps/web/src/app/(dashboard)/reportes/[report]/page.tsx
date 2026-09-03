import { notFound } from 'next/navigation';
import { api, ApiError } from '@/shared/api/client';
import { shortDate } from '@/shared/lib/format';
import { DateField } from '@/shared/ui/date-field';
import { DataTable } from '@/shared/ui/data-table';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListPagination, paginate } from '@/shared/ui/list-pagination';
import { StatCard } from '@/shared/ui/stat-card';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { PageHeader } from '@/shared/ui/page-header';

interface OperationalReport {
  title: string;
  range: { from: string; to: string };
  summary: { label: string; value: string; detail?: string }[];
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string>[];
}

const VALID = ['issued', 'collected', 'recovery', 'written-off', 'settlements', 'activity', 'concentration'];

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { report } = await params;
  if (!VALID.includes(report)) notFound();

  const raw = await searchParams;
  const search = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  );
  const query = new URLSearchParams();
  for (const key of ['from', 'to'] as const) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }

  let data: OperationalReport;
  try {
    data = await api<OperationalReport>(`/admin/reports/${report}?${query.toString()}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // El reporte llega completo; paginarlo aquí evita una tabla de 800 filas.
  const { page, props } = paginate(data.rows, search);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Reportes', href: '/reportes' }, { label: data.title }]}
        title={data.title}
        description={`Del ${shortDate(data.range.from)} al ${shortDate(data.range.to)}.`}
      />

      {/* El rango va en la URL: el reporte se puede compartir tal cual se vio. */}
      <form method="get" className="flex items-end gap-2">
        <DateField id="from" name="from" label="Desde" defaultValue={data.range.from} />
        <DateField id="to" name="to" label="Hasta" defaultValue={data.range.to} />
        <button type="submit" className="btn btn-secondary">
          Aplicar
        </button>

        {/* La descarga arrastra el mismo rango: lo que baja es lo que se ve. */}
        <a
          href={`/reportes/${report}/exportar?${query.toString()}`}
          target="_blank"
          rel="noopener"
          className="btn btn-primary"
        >
          <NavIcon.download />
          Exportar CSV
        </a>
      </form>

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.summary.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            {...(s.detail ? { detail: s.detail } : {})}
            icon={<NavIcon.reports />}
          />
        ))}
      </section>

      {/* La misma tabla que el resto de la aplicación: las filas del reporte
          no son un caso especial (§19.9). */}
      <DataTable
        caption={`${data.title}, del ${shortDate(data.range.from)} al ${shortDate(data.range.to)}`}
        columns={data.columns.map((column) => ({
          key: column.key,
          header: column.label,
          ...(column.numeric ? { align: 'right' as const } : {}),
          cell: (row: Record<string, string>) =>
            column.numeric ? <span className="tnum">{row[column.key] ?? '—'}</span> : (row[column.key] ?? '—'),
        }))}
        rows={page}
        rowKey={(row) => JSON.stringify(row)}
        empty={
          <EmptyState
            title="No hay movimientos en este periodo"
            hint="Prueba con un rango de fechas más amplio."
          />
        }
        footer={
          <ListPagination
            basePath={`/reportes/${report}`}
            params={search}
            shown={page.length}
            noun={['fila', 'filas']}
            {...props}
          />
        }
      />
    </div>
  );
}
