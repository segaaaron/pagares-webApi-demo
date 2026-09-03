import Link from 'next/link';
import type { ReactNode } from 'react';
import { Money } from '@/shared/ui/money';
import { Sparkline } from '@/shared/ui/charts/sparkline';

/**
 * Tarjeta de indicador.
 *
 * Reparto: franja del color del estado arriba, etiqueta y icono en la primera
 * línea, la cifra grande —con los centavos atenuados— y, abajo, el importe de
 * apoyo con la variación y la silueta de los últimos meses.
 *
 * La variación lleva flecha y signo además de color: verde y rojo solos no
 * dicen nada a quien no los distingue, y aquí significan cosas opuestas.
 */
export interface StatTrend {
  /**
   * Variación contra el periodo anterior, en porcentaje ya redondeado.
   * `null` cuando el mes pasado fue cero: dividir entre cero daría un infinito
   * y "+∞ %" no informa de nada.
   */
  percent: number | null;
  /** Serie para la silueta; el último punto es el periodo actual. */
  series: number[];
  /** Cuando subir es malo —vencido, por ejemplo— se invierten los colores. */
  moreIsWorse?: boolean;
}

const TONES = {
  neutral: { stripe: 'var(--color-accent)', pill: 'bg-accent-soft text-accent-ink', value: 'text-ink' },
  ok: { stripe: 'var(--color-ok)', pill: 'bg-ok-soft text-ok', value: 'text-ok' },
  warn: { stripe: 'var(--color-warn)', pill: 'bg-warn-soft text-warn', value: 'text-warn' },
  crit: { stripe: 'var(--color-crit)', pill: 'bg-crit-soft text-crit', value: 'text-crit' },
} as const;

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
  href,
  trend,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  tone?: keyof typeof TONES;
  href?: string;
  trend?: StatTrend;
}) {
  const styles = TONES[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase leading-4 tracking-[0.14em] text-muted">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${styles.pill}`} aria-hidden>
          {icon}
        </span>
      </div>

      <p className={`mt-2.5 text-[1.75rem] font-semibold leading-none ${styles.value}`}>
        <Money value={value} />
      </p>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {detail ? (
            <p className="truncate text-xs text-muted">
              <Money value={detail} />
            </p>
          ) : null}
          {trend && trend.percent !== null ? (
            <Delta percent={trend.percent} moreIsWorse={trend.moreIsWorse ?? false} />
          ) : null}
        </div>
        {trend && trend.series.length > 1 ? (
          <Sparkline values={trend.series} tone={styles.stripe} className="h-7 w-24 shrink-0" />
        ) : null}
      </div>
    </>
  );

  const shell = `card card-accent px-4 pb-3.5 pt-4 ${href ? 'card-interactive block transition-shadow' : ''}`;
  const style = { '--accent-stripe': styles.stripe } as React.CSSProperties;

  return href ? (
    <Link href={href} className={shell} style={style}>
      {body}
    </Link>
  ) : (
    <div className={shell} style={style}>
      {body}
    </div>
  );
}

function Delta({ percent, moreIsWorse }: { percent: number; moreIsWorse: boolean }) {
  if (!Number.isFinite(percent) || percent === 0) {
    return <p className="mt-1 text-[11px] text-muted">Sin cambio contra el mes pasado</p>;
  }

  const up = percent > 0;
  const good = moreIsWorse ? !up : up;
  return (
    <p className="mt-1.5">
      <span className={`delta ${good ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
        <span aria-hidden>{up ? '↑' : '↓'}</span>
        {up ? '+' : '−'}
        {Math.abs(percent)}%
      </span>
      <span className="ml-1.5 text-[11px] text-muted">contra el mes pasado</span>
    </p>
  );
}
