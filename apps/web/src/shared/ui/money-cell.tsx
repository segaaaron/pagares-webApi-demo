import { money } from '@/shared/lib/format';

/**
 * Celda de importe: alineada a la derecha y tabular, para comparar columnas
 * de un vistazo. `muted` se usa en importes secundarios como el abonado.
 */
export function MoneyCell({ cents, muted = false }: { cents: string; muted?: boolean }) {
  return (
    <span className={`tnum text-right ${muted ? 'text-muted' : 'text-ink'}`}>{money(cents)}</span>
  );
}
