/**
 * Evolución mensual: cobrado contra colocado, doce meses.
 *
 * SVG a mano y no una librería de gráficas: son dos polilíneas y una rejilla,
 * y el paquete más ligero del mercado pesa más que toda esta página. Además
 * así se renderiza en el servidor y llega pintada.
 *
 * Accesibilidad (§19.9): las series se distinguen por trazo —continuo y
 * punteado— además de por color, hay resumen para lector de pantalla y debajo
 * la tabla con las cifras exactas, que es la alternativa que pide WCAG cuando
 * el dato vive en un dibujo.
 */
export interface TrendPoint {
  label: string;
  collectedCents: string;
  issuedCents: string;
  collectedFormatted: string;
  issuedFormatted: string;
}

const W = 720;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 8 };

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const collected = points.map((p) => Number(BigInt(p.collectedCents) / 100n));
  const issued = points.map((p) => Number(BigInt(p.issuedCents) / 100n));
  const max = Math.max(...collected, ...issued, 1);

  const x = (i: number): number =>
    PAD.left + (i * (W - PAD.left - PAD.right)) / Math.max(points.length - 1, 1);
  const y = (v: number): number => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);

  const line = (values: number[]): string => values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = (values: number[]): string =>
    `${line(values)} ${x(values.length - 1)},${H - PAD.bottom} ${x(0)},${H - PAD.bottom}`;

  const totalCollected = collected.reduce((a, b) => a + b, 0);
  const last = points.at(-1);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full"
        role="img"
        aria-label={`Cobrado y colocado por mes, últimos ${points.length} meses. En ${last?.label ?? ''} se cobró ${last?.collectedFormatted ?? ''}.`}
      >
        {/* Cuatro líneas de referencia, tenues: orientan sin competir con el dato. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        ))}

        <polygon points={area(collected)} fill="var(--color-accent)" opacity="0.12" />
        <polyline
          points={line(collected)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={line(issued)}
          fill="none"
          stroke="var(--color-ink-2)"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={x(i)} cy={y(collected[i]!)} r="3" fill="var(--color-accent)" />
            {/* Una etiqueta sí y otra no: doce no caben sin encimarse. */}
            {i % 2 === 0 ? (
              <text
                x={x(i)}
                y={H - 6}
                textAnchor="middle"
                className="fill-[var(--color-muted)] text-[10px]"
              >
                {p.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-accent" aria-hidden />
          Cobrado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0.5 w-5 rounded"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, var(--color-ink-2) 0 5px, transparent 5px 9px)',
            }}
            aria-hidden
          />
          Colocado
        </span>
        <span className="tnum ml-auto">
          {points.length} meses · {new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            maximumFractionDigits: 0,
          }).format(totalCollected)}{' '}
          cobrado
        </span>
      </figcaption>

      {/* La alternativa en texto: un lector de pantalla no ve una polilínea. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted hover:text-ink">
          Ver los datos en tabla
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1 font-medium">Mes</th>
              <th scope="col" className="py-1 text-right font-medium">Cobrado</th>
              <th scope="col" className="py-1 text-right font-medium">Colocado</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t border-line">
                <td className="py-1">{p.label}</td>
                <td className="tnum py-1 text-right">{p.collectedFormatted}</td>
                <td className="tnum py-1 text-right">{p.issuedFormatted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
