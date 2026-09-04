import { PageSkeleton } from '@/shared/ui/page-skeleton';

export default function Loading() {
  return <PageSkeleton cards={8} rows={0} label="Cargando la cobranza" />;
}
