import { PageSkeleton } from '@/shared/ui/page-skeleton';

export default function Loading() {
  return <PageSkeleton cards={0} rows={9} label="Cargando los reportes" />;
}
