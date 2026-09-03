/**
 * Importe con los centavos atenuados.
 *
 * En una columna de dinero lo que se compara son los pesos; los centavos
 * ocupan el mismo sitio pero no la misma atención. Bajarles el peso visual
 * —sin quitarlos, porque un importe truncado es un importe falso— es lo que
 * hace que una tabla de cuarenta cifras se lea de un vistazo.
 */
export function Money({ value, className = '' }: { value: string; className?: string }) {
  // "$45,000.00 MXN" → pesos, centavos y moneda.
  const match = /^([^.]*)(\.\d+)?(\s.+)?$/.exec(value);
  if (!match) return <span className={`tnum ${className}`}>{value}</span>;

  const [, pesos, cents, currency] = match;
  return (
    <span className={`tnum ${className}`}>
      {pesos}
      {cents ? <span className="cents">{cents}</span> : null}
      {currency ? <span className="cents">{currency}</span> : null}
    </span>
  );
}
