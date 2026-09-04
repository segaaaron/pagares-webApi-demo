import Link from 'next/link';
import { getPortfolio } from '@/features/reports/queries';
import { shortDate } from '@/shared/lib/format';
import { StatCard } from '@/shared/ui/stat-card';
import { TrendChart } from '@/shared/ui/charts/trend-chart';
import { DonutChart } from '@/shared/ui/charts/donut-chart';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { PageHeader } from '@/shared/ui/page-header';

export const metadata = { title: 'Cartera' };

/** Cada barra es un filtro: al pulsarla se abre la lista de ese tramo (§19.7). */
export default async function PortfolioPage() {
  const report = await getPortfolio();

  const max = report.aging.reduce(
    (acc, b) => (BigInt(b.balanceCents) > acc ? BigInt(b.balanceCents) : acc),
    1n,
  );

  const indicators = [
    {
      label: 'Saldo por cobrar',
      value: report.totals.outstandingFormatted,
      hint: `${report.totals.activeNotes} pagarés vivos`,
      tone: 'neutral' as const,
      icon: <NavIcon.portfolio />,
    },
    {
      label: 'Vencido',
      value: report.totals.overdueFormatted,
      hint: `${report.totals.overdueNotes} con atraso`,
      tone: 'crit' as const,
      icon: <NavIcon.alert />,
    },
    {
      label: 'Cartera vencida',
      value: report.totals.nonPerformingFormatted,
      hint: '90 días o más',
      tone: 'warn' as const,
      icon: <NavIcon.clock />,
    },
    {
      label: 'Cobrado este mes',
      value: report.totals.collectedThisMonthFormatted,
      hint: 'Abonos registrados',
      tone: 'ok' as const,
      icon: <NavIcon.check />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Cartera' }]}
        title="Cartera"
        description="Saldo, antigüedad y reparto del riesgo."
        meta={<span className="chip bg-surface text-muted">Al {shortDate(report.asOf)}</span>}
        actions={
          <>
            {/* Las descargas de la foto de hoy viven donde se ve la foto, no en
                Reportes: allí eran dos filas cuyo botón devolvía aquí. */}
            <a href="/reportes/exportar/cartera" className="btn btn-secondary">
              <NavIcon.download />
              Vigente vs. vencida
            </a>
            <a href="/reportes/exportar/antiguedad" className="btn btn-secondary">
              <NavIcon.download />
              Antigüedad
            </a>
          </>
        }
      />

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {indicators.map((i) => (
          <StatCard
            key={i.label}
            label={i.label}
            value={i.value}
            detail={i.hint}
            icon={i.icon}
            tone={i.tone}
          />
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="flow-title" className="card p-5">
          <h2 id="flow-title" className="text-sm font-semibold">Cobrado y colocado</h2>
          <p className="mb-3 text-xs text-muted">
            Doce meses, para ver si la cobranza sigue el ritmo de la colocación.
          </p>
          <TrendChart points={report.flow} />
        </section>

        <section aria-labelledby="mix-title" className="card p-5">
          <h2 id="mix-title" className="text-sm font-semibold">Reparto del saldo</h2>
          <p className="mb-4 text-xs text-muted">En qué situación está cada peso por cobrar.</p>
          <DonutChart slices={report.mix} totalFormatted={report.totals.outstandingFormatted} />
        </section>
      </div>

      <section aria-label="Antigüedad de saldos" className="card p-5">
        <h2 className="mb-1 text-sm font-semibold">Antigüedad de saldos</h2>
        <p className="mb-4 text-xs text-muted">
          Vencido no es lo mismo que cartera vencida: ésta empieza a los 90 días naturales.
        </p>

        <ul className="space-y-2">
          {report.aging.map((bucket) => {
            const width = Number((BigInt(bucket.balanceCents) * 100n) / max);
            return (
              <li key={bucket.bucket}>
                <Link
                  href={`/pagares?bucket=${bucket.bucket}`}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  <span className="w-36 shrink-0 text-sm">{bucket.label}</span>
                  <span className="h-4 flex-1 overflow-hidden rounded bg-surface-2">
                    <span
                      className={`block h-full ${
                        bucket.bucket === 'CURRENT'
                          ? 'bg-accent'
                          : bucket.bucket === 'D120_PLUS' || bucket.bucket === 'D91_120'
                            ? 'bg-crit'
                            : 'bg-warn'
                      }`}
                      style={{ width: `${Math.max(width, bucket.count > 0 ? 2 : 0)}%` }}
                    />
                  </span>
                  <span className="tnum w-10 shrink-0 text-right text-xs text-muted">{bucket.count}</span>
                  <span className="tnum w-36 shrink-0 text-right text-sm">{bucket.balanceFormatted}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
