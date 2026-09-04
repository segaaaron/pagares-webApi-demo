import Link from 'next/link';
import { getPortfolio } from '@/features/reports/queries';
import { shortDate } from '@/shared/lib/format';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { PageHeader } from '@/shared/ui/page-header';

export const metadata = { title: 'Reportes' };

/**
 * Catálogo de reportes (§17.2).
 *
 * Va en tabla y no en tarjetas porque un catálogo se recorre, no se contempla:
 * nueve filas con su alcance, su formato y sus acciones se leen de un vistazo,
 * mientras que nueve tarjetas obligan a barrer la pantalla en zigzag. Es el
 * patrón habitual de los gestores de reportes: icono que identifica, metadatos
 * en columnas y las acciones al final de cada fila.
 *
 * Lo que esta pantalla hace y las operativas no: **acotar por fechas y sacar el
 * archivo**. Para "cómo vamos hoy" están el Panel y Cartera.
 */
interface ReportRow {
  slug: string;
  title: string;
  description: string;
  group: 'Cartera' | 'Colocación' | 'Gestión';
  /** Foto fija del saldo de hoy, o periodo acotable por fechas. */
  icon: React.ReactNode;
  /** La pantalla del reporte, con su rango. */
  viewHref: string;
  downloadHref: string;
}

const GROUP_CHIP: Record<ReportRow['group'], string> = {
  Cartera: 'bg-accent-soft text-accent-ink',
  Colocación: 'bg-ok-soft text-ok',
  Gestión: 'bg-warn-soft text-warn',
};

const REPORTS: ReportRow[] = [
  {
    slug: 'concentration',
    title: 'Concentración por deudor',
    description: 'Cuánto del riesgo está en pocas manos.',
    group: 'Cartera',
    icon: <NavIcon.clients />,
    viewHref: '/reportes/concentration',
    downloadHref: '/reportes/concentration/exportar',
  },
  {
    slug: 'issued',
    title: 'Colocado por periodo',
    description: 'Cuántos pagarés se emitieron y por cuánto importe.',
    group: 'Colocación',
    icon: <NavIcon.notes />,
    viewHref: '/reportes/issued',
    downloadHref: '/reportes/issued/exportar',
  },
  {
    slug: 'collected',
    title: 'Liquidado por periodo',
    description: 'Cuánto se recuperó y en cuántos días, en promedio.',
    group: 'Colocación',
    icon: <NavIcon.check />,
    viewHref: '/reportes/collected',
    downloadHref: '/reportes/collected/exportar',
  },
  {
    slug: 'recovery',
    title: 'Recuperación del periodo',
    description: 'Cobrado, separando capital, intereses y recuperación de castigos.',
    group: 'Colocación',
    icon: <NavIcon.check />,
    viewHref: '/reportes/recovery',
    downloadHref: '/reportes/recovery/exportar',
  },
  {
    slug: 'written-off',
    title: 'Cartera dada de baja y recuperada',
    description: 'Lo dado de baja contablemente y lo que aun así se cobró.',
    group: 'Colocación',
    icon: <NavIcon.alert />,
    viewHref: '/reportes/written-off',
    downloadHref: '/reportes/written-off/exportar',
  },
  {
    slug: 'settlements',
    title: 'Convenios',
    description: 'Vigentes, cumplidos e incumplidos, con las quitas otorgadas.',
    group: 'Gestión',
    icon: <NavIcon.collections />,
    viewHref: '/reportes/settlements',
    downloadHref: '/reportes/settlements/exportar',
  },
  {
    slug: 'activity',
    title: 'Gestión del periodo',
    description: 'Contactos registrados y promesas obtenidas.',
    group: 'Gestión',
    icon: <NavIcon.collections />,
    viewHref: '/reportes/activity',
    downloadHref: '/reportes/activity/exportar',
  },
];

export default async function ReportsPage() {
  const portfolio = await getPortfolio();

  const columns: Column<ReportRow>[] = [
    {
      key: 'report',
      header: 'Reporte',
      cell: (report) => (
        <span className="flex items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"
            aria-hidden
          >
            {report.icon}
          </span>
          <span className="min-w-0">
            <Link href={report.viewHref} className="block text-sm font-semibold text-ink hover:underline">
              {report.title}
            </Link>
            <span className="block text-xs text-muted">{report.description}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'group',
      header: 'Área',
      width: '9rem',
      cell: (report) => <span className={`chip ${GROUP_CHIP[report.group]}`}>{report.group}</span>,
    },
    {
      key: 'scope',
      header: 'Periodo',
      width: '11rem',
      cell: () => <span className="text-xs text-ink-2">Rango de fechas</span>,
    },
    {
      key: 'format',
      header: 'Formato',
      width: '6.5rem',
      cell: () => <span className="chip bg-surface-2 text-muted">CSV</span>,
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '13rem',
      cell: (report) => (
        <span className="flex justify-end gap-1.5">
          <Link href={report.viewHref} className="btn btn-secondary btn-sm">
            Abrir
          </Link>
          <a
            href={report.downloadHref}
            target="_blank"
            rel="noopener"
            className="btn btn-ghost btn-sm px-2"
            aria-label={`Descargar ${report.title} en CSV`}
            title="Descargar CSV"
          >
            <NavIcon.download />
          </a>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Reportes' }]}
        title="Reportes"
        description="Qué pasó entre dos fechas, con su archivo. El saldo de hoy está en Cartera."
        meta={<span className="chip bg-surface text-muted">Datos al {shortDate(portfolio.asOf)}</span>}
      />

      <DataTable
        caption="Catálogo de reportes con su alcance, formato y acciones"
        columns={columns}
        rows={REPORTS}
        rowKey={(report) => report.slug}
        empty={null}
      />

      {/* La exportación contable no es un décimo reporte: no agrega nada. Son
          las filas con importes en pesos y punto decimal, para cuadrarlas contra
          las pólizas (§17.2). */}
      <section className="card p-4" aria-label="Exportación contable">
        <h2 className="text-sm font-semibold">Exportación contable</h2>
        <p className="mt-1 text-xs text-muted">
          Sin agregar: una fila por pagaré o por abono, con los importes en formato que la hoja de
          cálculo suma.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/reportes/contable/cartera"
            target="_blank"
            rel="noopener"
            className="btn btn-secondary btn-sm"
          >
            <NavIcon.download />
            Cartera al corte
          </a>
          <a
            href="/reportes/contable/abonos"
            target="_blank"
            rel="noopener"
            className="btn btn-secondary btn-sm"
          >
            <NavIcon.download />
            Abonos del mes
          </a>
        </div>
      </section>

      <p className="text-xs text-muted">
        Los de rango abren con el mes en curso; al cambiarlo, la descarga arrastra el mismo periodo
        que estás viendo.
      </p>
    </div>
  );
}
