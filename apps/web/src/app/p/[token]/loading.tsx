import { PageSkeleton } from '@/shared/ui/page-skeleton';

/**
 * La consulta pública la abre el deudor desde el móvil, muchas veces con mala
 * cobertura: una pantalla en blanco parece un enlace roto.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <PageSkeleton cards={0} rows={6} label="Cargando el pagaré" />
    </div>
  );
}
