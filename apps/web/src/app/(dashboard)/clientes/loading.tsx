import { PageSkeleton } from '@/shared/ui/page-skeleton';

export default function Loading() {
  return <PageSkeleton cards={0} rows={8} label="Cargando los deudores" />;
}
