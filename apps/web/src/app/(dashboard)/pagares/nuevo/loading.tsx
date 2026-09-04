import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** El formulario espera a los ajustes y, si viene de un deudor, a su ficha. */
export default function Loading() {
  return <PageSkeleton cards={0} rows={7} label="Cargando el formulario de emisión" />;
}
