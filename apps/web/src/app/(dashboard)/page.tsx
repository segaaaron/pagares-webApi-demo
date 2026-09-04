import Link from 'next/link';
import { getWorkQueues } from '@/features/queues/queries';
import { getNotifications } from '@/features/notifications/queries';
import { getTodaysReminders, tramoLabel } from '@/features/reminders/queries';
import { SendTodaysReminders } from '@/features/reminders/send-today';
import { QueueBoard } from '@/features/queues/queue-board';
import { getPortfolio } from '@/features/reports/queries';
import { getSettings } from '@/features/settings/queries';
import { StatCard } from '@/shared/ui/stat-card';
import { TrendChart } from '@/shared/ui/charts/trend-chart';
import { DonutChart } from '@/shared/ui/charts/donut-chart';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { PageHeader } from '@/shared/ui/page-header';

export const metadata = { title: 'Panel' };

/**
 * Panel — la bandeja de trabajo (§19.2).
 *
 * Es una lista de acciones, no un panel de gráficas: la pregunta al abrir el
 * sistema es "qué hago ahora", y cada cola trae ya el botón para hacerlo.
 */
export default async function TodayPage() {
  const [queues, portfolio, settings, avisos, recordatorios] = await Promise.all([
    getWorkQueues(),
    getPortfolio(),
    getSettings(),
    getNotifications(),
    getTodaysReminders(),
  ]);

  // Serie de cobranza para la silueta y la variación: doce meses en pesos.
  const collected = portfolio.flow.map((point) => Number(BigInt(point.collectedCents) / 100n));
  const thisMonth = collected.at(-1) ?? 0;
  const lastMonth = collected.at(-2) ?? 0;
  // Sin mes anterior no hay variación que calcular; se enseña sólo la silueta.
  const collectedDelta = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  // Los cuatro del diseño: cuántos hay en cada situación, con su importe debajo.
  // Cada uno enlaza a su pestaña: el número contesta "cuántos" y el clic, "cuáles".
  const indicators = [
    {
      label: 'Vigentes',
      count: portfolio.totals.activeNotes - portfolio.totals.overdueNotes,
      detail: portfolio.totals.outstandingFormatted,
      tone: 'neutral' as const,
      icon: <NavIcon.notes />,
      href: '/pagares?tab=vigentes',
    },
    {
      label: 'Vencen en 7 días',
      count: portfolio.totals.dueSoonNotes,
      detail: portfolio.totals.dueSoonFormatted,
      tone: 'warn' as const,
      icon: <NavIcon.clock />,
      href: '/pagares?tab=por-vencer',
    },
    {
      label: 'Vencidos',
      count: portfolio.totals.overdueNotes,
      detail: portfolio.totals.overdueFormatted,
      tone: 'crit' as const,
      icon: <NavIcon.alert />,
      href: '/pagares?tab=vencidos',
    },
    {
      label: 'Pagados este mes',
      count: null,
      detail: portfolio.totals.collectedThisMonthFormatted,
      tone: 'ok' as const,
      icon: <NavIcon.check />,
      href: '/pagares?tab=pagados',
      trend: { percent: collectedDelta, series: collected.slice(-8) },
    },
  ];

  const sections = [
    { id: 'due-today', title: 'Vencen hoy', hint: 'Hay que cobrarlos hoy mismo.', empty: 'Nada vence hoy.', items: queues.dueToday, icon: <NavIcon.clock />, tone: 'warn' as const },
    { id: 'broken', title: 'Promesas incumplidas', hint: 'Prometieron pagar y no llegó el abono.', empty: 'Ninguna promesa incumplida.', items: queues.brokenPromises, icon: <NavIcon.alert />, tone: 'crit' as const },
    { id: 'unattended', title: 'Con atraso sin gestión', hint: 'Siete días sin un contacto registrado.', empty: 'Todo lo atrasado tiene gestión reciente.', items: queues.unattended, icon: <NavIcon.collections />, tone: 'crit' as const },
    { id: 'pending', title: 'Firmas pendientes', hint: 'Enviados hace más de 48 h y sin firmar.', empty: 'No hay firmas pendientes.', items: queues.pendingSignature, icon: <NavIcon.document />, tone: 'neutral' as const },
    { id: 'no-channel', title: 'Sin canal automático', hint: 'Sin correo: el aviso es manual.', empty: 'Todos los deudores con atraso tienen correo.', items: queues.noChannel, icon: <NavIcon.clients />, tone: 'neutral' as const },
    { id: 'prescribing', title: 'Por prescribir', hint: 'Cerca del plazo para demandar. Demandar detiene el reloj.', empty: 'Ninguno cerca del plazo.', items: queues.prescribing, icon: <NavIcon.alert />, tone: 'warn' as const },
    { id: 'prescribed', title: 'Fuera de plazo', hint: 'Ya no se pueden demandar. Cobrarlos sí, pero sólo de buena fe.', empty: 'Ninguno fuera de plazo.', items: queues.prescribed, icon: <NavIcon.alert />, tone: 'crit' as const },
  ];

  const pending = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel"
        description={
          pending === 0
            ? 'No hay nada pendiente. Buen día.'
            : `${pending} ${pending === 1 ? 'asunto requiere' : 'asuntos requieren'} tu atención.`
        }
      />

      {/*
        * Un correo que no sale no interrumpe ninguna operación, así que sin este
        * aviso puede pasar horas sin que nadie lo note —y con la contraseña de
        * un cliente dentro. Va antes que los indicadores porque es lo único de
        * esta pantalla que está roto ahora mismo (§22.3).
        */}
      {avisos.counts.stuck > 0 ? (
        <section
          aria-label="Avisos sin entregar"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crit bg-crit-soft px-4 py-3"
        >
          <p className="text-sm text-crit">
            <span className="font-semibold">
              {avisos.counts.stuck}{' '}
              {avisos.counts.stuck === 1 ? 'aviso no llegó' : 'avisos no llegaron'}
            </span>{' '}
            a su destinatario y ya no se reintentan solos.
          </p>
          <Link href="/avisos" className="btn btn-secondary btn-sm">
            Ver y reenviar
          </Link>
        </section>
      ) : null}

      {/*
        * Los recordatorios del día, en un solo envío.
        *
        * Antes había que entrar en cada pagaré: con treinta vencimientos, treinta
        * viajes. Se enseña a quién le va a llegar **antes** de mandar nada, y
        * pulsarlo dos veces el mismo día no duplica ningún correo (§13.1).
        */}
      {recordatorios.pending.length > 0 ? (
        <section aria-labelledby="recordatorios-title" className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="recordatorios-title" className="text-base font-semibold text-ink">
                Recordatorios de hoy
              </h2>
              <p className="text-sm text-muted">
                {recordatorios.pending.length === 1
                  ? 'Un deudor debe recibir aviso hoy.'
                  : `${recordatorios.pending.length} deudores deben recibir aviso hoy.`}
                {recordatorios.alreadySent.length > 0
                  ? ` Otros ${recordatorios.alreadySent.length} ya lo recibieron.`
                  : ''}
              </p>
            </div>
            <SendTodaysReminders count={recordatorios.pending.length} />
          </div>

          <ul className="mt-3 divide-y divide-line border-t border-line">
            {recordatorios.pending.slice(0, 6).map((aviso) => (
              <li key={aviso.noteId} className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm">
                <span className="tnum font-mono text-xs text-muted">{aviso.folio}</span>
                <span className="font-medium text-ink">{aviso.debtorName}</span>
                <span className="text-xs text-muted">{aviso.to}</span>
                <span className="ml-auto text-xs text-ink-2">{tramoLabel(aviso.offsetDays)}</span>
              </li>
            ))}
          </ul>
          {recordatorios.pending.length > 6 ? (
            <p className="mt-2 text-xs text-muted">
              y {recordatorios.pending.length - 6} más.
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {indicators.map((i) => (
          <StatCard
            key={i.label}
            label={i.label}
            value={i.count !== null ? String(i.count) : i.detail}
            {...(i.count !== null ? { detail: i.detail } : {})}
            icon={i.icon}
            tone={i.tone}
            {...(i.href ? { href: i.href } : {})}
            {...('trend' in i && i.trend ? { trend: i.trend } : {})}
          />
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="flow-title" className="card p-5">
          <h2 id="flow-title" className="text-sm font-semibold">Cobrado y colocado</h2>
          <p className="mb-3 text-xs text-muted">
            Doce meses. La línea continua es lo que entró; la punteada, lo que se emitió.
          </p>
          <TrendChart points={portfolio.flow} />
        </section>

        <section aria-labelledby="mix-title" className="card p-5">
          <h2 id="mix-title" className="text-sm font-semibold">Reparto del saldo</h2>
          <p className="mb-4 text-xs text-muted">
            En qué situación está cada peso por cobrar.
          </p>
          <DonutChart slices={portfolio.mix} totalFormatted={portfolio.totals.outstandingFormatted} />
        </section>
      </div>

      <QueueBoard queues={sections} organizationName={settings.legalName} />
    </div>
  );
}
