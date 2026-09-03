/**
 * Sparkline: la forma de la serie, sin ejes ni cifras.
 *
 * Va dentro de la tarjeta de indicador para contestar "¿y viene subiendo?"
 * sin ocupar una gráfica entera. No lleva etiquetas a propósito: la cifra
 * exacta ya está encima, y aquí sólo importa la silueta.
 */
export function Sparkline({
  values,
  tone = 'var(--color-accent)',
  className = '',
}: {
  values: number[];
  tone?: string;
  className?: string;
}) {
  if (values.length < 2) return null;

  const W = 120;
  const H = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const x = (i: number): number => (i * W) / (values.length - 1);
  const y = (v: number): number => H - 2 - ((v - min) / span) * (H - 4);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.at(-1) ?? 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden preserveAspectRatio="none">
      <polygon points={`${line} ${W},${H} 0,${H}`} fill={tone} opacity="0.10" />
      <polyline points={line} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="2.2" fill={tone} />
    </svg>
  );
}
