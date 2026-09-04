import { PageSkeleton } from '@/shared/ui/page-skeleton';

/**
 * Un reporte puede tardar: agrega la cartera entera. Sin esto, la pantalla se
 * quedaba con el reporte anterior en pantalla mientras llegaba el nuevo.
 */
export default function Loading() {
  return <PageSkeleton cards={0} rows={10} label="Calculando el reporte" />;
}
