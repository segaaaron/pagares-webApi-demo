import Link from 'next/link';
import { getWorkQueues } from '@/features/queues/queries';
import { QueueBoard } from '@/features/queues/queue-board';
import { getOperationalReport, getPortfolio, summaryValue } from '@/features/reports/queries';
import { getSettings } from '@/features/settings/queries';
import { Money } from '@/shared/ui/money';
import { StatCard } from '@/shared/ui/stat-card';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { PageHeader } from '@/shared/ui/page-header';
import { Suspense } from 'react';
import { StageList } from '@/features/collections/stage-list';
import { TableSkeleton } from '@/shared/ui/table-skeleton';

export const metadata = { title: 'Cobranza' };

/**
 * Embudo de cobranza (§19.7). La etapa se sugiere por días de atraso, pero el
 * administrador puede congelarla: un deudor que responde no debe escalar a
 * judicial por calendario.
 *
 * Las cuatro etapas se pintan como embudo de verdad —con la proporción del
 * saldo en una barra— porque la pregunta no es "cuántos hay en judicial", sino
 * "qué parte de mi dinero está ahí".
 */
const STAGES = [
  {
    id: 'PREVENTIVA',
    label: 'Preventiva',
    range: 'Hasta el vencimiento',
    buckets: ['CURRENT'],
    tone: 'ok',
    action: 'Recordar antes de que venza',
  },
  {
    id: 'ADMINISTRATIVA',
    label: 'Administrativa',
    range: '1 a 30 días',
    buckets: ['D1_30'],
    tone: 'warn',
    action: 'Llamar y registrar la gestión',
  },
  {
    id: 'EXTRAJUDICIAL',
    label: 'Extrajudicial',
    range: '31 a 89 días',
    buckets: ['D31_60', 'D61_90'],
    tone: 'warn',
    action: 'Negociar convenio',
  },
  {
    id: 'JUDICIAL',
    label: 'Judicial',
    range: '90 días o más',
    buckets: ['D91_120', 'D120_PLUS'],
    tone: 'crit',
    action: 'Valorar demanda antes de que prescriba',
  },
] as const;

const TONES = {
  ok: { bar: 'bg-ok', pill: 'bg-ok-soft text-ok', stripe: 'var(--color-ok)' },
  warn: { bar: 'bg-warn', pill: 'bg-warn-soft text-warn', stripe: 'var(--color-warn)' },
  crit: { bar: 'bg-crit', pill: 'bg-crit-soft text-crit', stripe: 'var(--color-crit)' },
} as const;

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const consulta = await searchParams;
  const etapaAbierta = typeof consulta['etapa'] === 'string' ? consulta['etapa'] : null;

  const [portfolio, queues, settings, recovery, activity, settlements] = await Promise.all([
    getPortfolio(),
    getWorkQueues(),
    getSettings(),
    // Del mes en curso, que es el periodo por defecto de los reportes.
    getOperationalReport('recovery'),
    getOperationalReport('activity'),
    getOperationalReport('settlements'),
  ]);

  // La serie de cobranza da la silueta y la variación contra el mes pasado.
  const collected = portfolio.flow.map((point) => Number(BigInt(point.collectedCents) / 100n));
  const thisMonth = collected.at(-1) ?? 0;
  const lastMonth = collected.at(-2) ?? 0;
  const delta = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  const promises = Number(summaryValue(activity, 'Promesas obtenidas')) || 0;
  const broken = queues.brokenPromises.length;
  // Cumplimiento de promesas: el indicador que dice si la gestión sirve.
  const keptRate = promises > 0 ? Math.round(((promises - broken) / promises) * 100) : null;

  const byBucket = new Map(portfolio.aging.map((b) => [b.bucket, b]));
  const stages = STAGES.map((stage) => {
    const rows = stage.buckets.map((b) => byBucket.get(b)).filter(Boolean);
    return {
      ...stage,
      count: rows.reduce((n, r) => n + (r?.count ?? 0), 0),
      cents: rows.reduce((n, r) => n + BigInt(r?.balanceCents ?? '0'), 0n),
    };
  });
  const total = stages.reduce((n, s) => n + s.cents, 0n);
  const share = (cents: bigint): number => (total > 0n ? Number((cents * 1000n) / total) / 10 : 0);
  const mxn = (cents: bigint): string =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(cents) / 100);

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Cobranza' }]}
        title="Cobranza"
        description="El embudo por etapa y las bandejas de hoy. Cada tarjeta abre su lista."
      />

      <section aria-label="Indicadores de cobranza" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cobrado este mes"
          value={summaryValue(recovery, 'Total cobrado')}
          detail={`${summaryValue(recovery, 'Recuperación de castigos')} de castigos`}
          icon={<NavIcon.check />}
          tone="ok"
          trend={{ percent: delta, series: collected.slice(-8) }}
        />
        <StatCard
          label="Contactos del mes"
          value={summaryValue(activity, 'Contactos registrados')}
          detail={`${summaryValue(activity, 'Sin respuesta')} sin respuesta`}
          icon={<NavIcon.clients />}
          tone="neutral"
        />
        <StatCard
          label="Promesas cumplidas"
          value={keptRate === null ? 'Sin promesas' : `${keptRate}%`}
          detail={`${promises} obtenidas · ${broken} incumplidas`}
          icon={<NavIcon.collections />}
          tone={keptRate !== null && keptRate < 60 ? 'crit' : 'neutral'}
        />
        <StatCard
          label="Convenios vigentes"
          value={summaryValue(settlements, 'Vigentes')}
          detail={`${summaryValue(settlements, 'Incumplidos')} incumplidos · ${summaryValue(settlements, 'Quitas otorgadas')} en quitas`}
          icon={<NavIcon.notes />}
          tone="warn"
          href="/reportes/settlements"
        />
      </section>

      <section aria-label="Embudo por etapa" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage) => {
          const tone = TONES[stage.tone];
          return (
            <Link
              key={stage.id}
              href={etapaAbierta === stage.id ? '/cobranza' : `/cobranza?etapa=${stage.id}`}
              aria-expanded={etapaAbierta === stage.id}
              className={`card card-accent card-interactive block px-4 pb-4 pt-4 transition-shadow ${
                etapaAbierta === stage.id ? 'ring-2 ring-accent' : ''
              }`}
              style={{ '--accent-stripe': tone.stripe } as React.CSSProperties}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {stage.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">{stage.range}</p>
                </div>
                <span className={`chip ${tone.pill}`}>
                  {stage.count} {stage.count === 1 ? 'pagaré' : 'pagarés'}
                </span>
              </div>

              <p className="mt-3 text-2xl font-semibold leading-none">
                <Money value={mxn(stage.cents)} />
              </p>

              {/* La barra dice qué parte del saldo vivo está en esta etapa. */}
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${tone.bar}`}
                    style={{ width: `${Math.max(share(stage.cents), stage.cents > 0n ? 3 : 0)}%` }}
                  />
                </div>
                <p className="tnum mt-1.5 text-[11px] text-muted">
                  {share(stage.cents).toFixed(1)}% del saldo · {stage.action}
                </p>
              </div>
            </Link>
          );
        })}
      </section>

      {etapaAbierta ? (
        <Suspense key={etapaAbierta} fallback={<TableSkeleton rows={5} />}>
          <StageList stageId={etapaAbierta} />
        </Suspense>
      ) : null}

      <QueueBoard
        organizationName={settings.legalName}
        queues={[
          {
            id: 'due-today',
            title: 'Vencen hoy',
            hint: 'Última oportunidad de cobrarlos sin atraso.',
            empty: 'Nada vence hoy.',
            items: queues.dueToday,
            icon: <NavIcon.clock />,
            tone: 'warn',
          },
          {
            id: 'broken',
            title: 'Promesas incumplidas',
            hint: 'Prometieron pagar y no llegó el abono.',
            empty: 'Ninguna promesa incumplida.',
            items: queues.brokenPromises,
            icon: <NavIcon.alert />,
            tone: 'crit',
          },
          {
            id: 'unattended',
            title: 'Con atraso y sin gestión reciente',
            hint: 'Siete días sin un contacto registrado.',
            empty: 'Todo lo atrasado tiene gestión de los últimos 7 días.',
            items: queues.unattended,
            icon: <NavIcon.collections />,
            tone: 'crit',
          },
          {
            id: 'prescribing',
            title: 'Por prescribir',
            hint: 'Cerca del plazo legal para demandar; después ya no se puede.',
            empty: 'Ninguno cerca del plazo.',
            items: queues.prescribing,
            icon: <NavIcon.alert />,
            tone: 'crit',
          },
          {
            id: 'no-channel',
            title: 'Sin canal automático',
            hint: 'Deudores sin correo: el aviso hay que darlo a mano.',
            empty: 'Todos los deudores con atraso tienen correo.',
            items: queues.noChannel,
            icon: <NavIcon.clients />,
            tone: 'warn',
          },
        ]}
      />
    </div>
  );
}
