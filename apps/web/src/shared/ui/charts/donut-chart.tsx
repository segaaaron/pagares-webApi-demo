/**
 * Reparto del saldo vivo en cuatro rebanadas.
 *
 * Cuatro y no más: por encima de cinco categorías el anillo deja de leerse y
 * conviene una barra. Cada rebanada lleva su cifra en la leyenda, así que el
 * color es apoyo y no el único portador del dato.
 */
export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  balanceCents: string;
  balanceFormatted: string;
}

const TONES: Record<string, string> = {
  current: 'var(--color-accent)',
  dueSoon: 'var(--color-warn)',
  overdue: 'var(--color-crit)',
  settlement: 'var(--color-ink-2)',
};

const R = 52;
const STROKE = 20;
const C = 2 * Math.PI * R;

export function DonutChart({ slices, totalFormatted }: { slices: DonutSlice[]; totalFormatted: string }) {
  const values = slices.map((s) => Number(BigInt(s.balanceCents) / 100n));
  const total = values.reduce((a, b) => a + b, 0);

  let offset = 0;
  const arcs = slices.map((slice, i) => {
    const value = values[i]!;
    const share = total > 0 ? value / total : 0;
    const arc = { slice, share, dash: share * C, offset };
    offset += share * C;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0" role="img" aria-label={`Reparto del saldo: ${slices.map((s) => `${s.label}, ${s.balanceFormatted}`).join('; ')}`}>
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={STROKE} />
          {arcs.map(({ slice, dash, offset: start }) =>
            dash > 0 ? (
              <circle
                key={slice.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={TONES[slice.key] ?? 'var(--color-line-strong)'}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-start}
              />
            ) : null,
          )}
        </g>
        <text x="70" y="66" textAnchor="middle" className="fill-[var(--color-muted)] text-[9px] uppercase tracking-[0.12em]">
          Saldo
        </text>
        <text x="70" y="80" textAnchor="middle" className="tnum fill-[var(--color-ink)] text-[11px] font-semibold">
          {totalFormatted.replace(' MXN', '')}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: TONES[slice.key] ?? 'var(--color-line-strong)' }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-ink-2">{slice.label}</span>
            <span className="tnum text-xs text-muted">{slice.count}</span>
            <span className="tnum w-32 text-right">{slice.balanceFormatted}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
