import { PageSkeleton } from '@/shared/ui/page-skeleton';

export default function Loading() {
  return <PageSkeleton cards={0} rows={5} label="Cargando los ajustes" />;
}
