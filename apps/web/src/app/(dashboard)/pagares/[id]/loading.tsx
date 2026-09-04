import { PageSkeleton } from '@/shared/ui/page-skeleton';

export default function Loading() {
  return <PageSkeleton cards={4} rows={5} label="Cargando el pagaré" />;
}
