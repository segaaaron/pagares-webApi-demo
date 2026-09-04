import Link from 'next/link';
import { Suspense } from 'react';
import { listNotes } from '@/features/notes/queries';
import { NotesFilters } from '@/features/notes/filters';
import { NotesTable } from '@/features/notes/notes-table';
import { TableSkeleton } from '@/shared/ui/table-skeleton';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { Pagination } from '@/shared/ui/pagination';
import { PageHeader } from '@/shared/ui/page-header';
import { RouteNotice } from '@/shared/ui/route-notice';

export const metadata = { title: 'Pagarés' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    // `aviso` es cosa de esta pantalla; mandarlo como filtro lo rechazaría la API.
    if (key === 'aviso') continue;
    if (typeof value === 'string' && value !== '') params.set(key, value);
  }
  return params;
}

async function NotesList({ params }: { params: URLSearchParams }) {
  const page = await listNotes(params);

  return (
    <>
      <NotesFilters params={params} />

      {/* El pie va dentro de la tabla: el conteo y los controles pertenecen a
          ella, no flotan debajo. */}
      <NotesTable
        notes={page.data}
        params={params}
        sort={params.get('orden') ?? 'vencimiento'}
        footer={
          <Pagination
            basePath="/pagares"
            params={params}
            nextCursor={page.page.nextCursor}
            shown={page.data.length}
            total={page.counts.total}
            overdue={page.counts.overdue}
            pageSize={page.page.limit}
          />
        }
      />
    </>
  );
}

/** Motivos con los que una descarga devuelve al administrador aquí. */
const AVISOS: Record<string, { tone: 'warning' | 'error'; message: string }> = {
  'sin-pagares': { tone: 'warning', message: 'No hay pagarés que descargar con los filtros puestos.' },
  'descarga-fallida': {
    tone: 'error',
    message: 'No se pudo armar la descarga. Inténtalo de nuevo en un momento.',
  },
};

export default async function NotesPage({ searchParams }: PageProps) {
  const consulta = await searchParams;
  const params = toParams(consulta);
  const aviso = typeof consulta['aviso'] === 'string' ? AVISOS[consulta['aviso']] : undefined;

  /**
   * Con la cartera vacía, exportar y empaquetar no tienen nada que hacer: los
   * botones se apagan en vez de dejar que el administrador los pulse para
   * recibir un error. Una consulta de una fila basta para saberlo.
   */
  const sonda = new URLSearchParams(params);
  sonda.set('limit', '1');
  const hayPagares = (await listNotes(sonda)).data.length > 0;

  /**
   * Cartera recién estrenada: no hay nada que filtrar.
   *
   * Con la base vacía, ofrecer diez estados, dos fechas, una búsqueda y una
   * paginación de «0 de 0» es dar herramientas para buscar en un cajón vacío.
   * Lo único que cabe hacer aquí es emitir el primero.
   */
  const sinFiltros = [...params.keys()].every((k) => k === 'orden' || k === 'limit');
  const carteraVacia = !hayPagares && sinFiltros;

  return (
    <div className="space-y-5">
      {aviso ? <RouteNotice tone={aviso.tone} message={aviso.message} /> : null}
      <PageHeader
        crumbs={[{ label: 'Pagarés' }]}
        title="Pagarés"
        description="Ordenados por vencimiento: lo que vence primero, primero."
        actions={
          <>
            <DescargaBoton
              href={`/pagares/exportar?${params.toString()}`}
              habilitado={hayPagares}
              titulo="La cartera filtrada, en CSV"
            >
              Exportar CSV
            </DescargaBoton>
            {/* Los PDFs de lo que se está viendo, en un zip (§17.2): con los
                filtros puestos, es "los pagarés de este deudor" sin abrir cien
                pestañas. */}
            <DescargaBoton
              href={`/pagares/pdfs?${params.toString()}`}
              habilitado={hayPagares}
              titulo="Los pagarés filtrados, en PDF y comprimidos (máximo 100)"
            >
              PDFs en zip
            </DescargaBoton>
            <Link href="/pagares/nuevo" className="btn btn-primary">
              Emitir pagaré
            </Link>
          </>
        }
      />

      {carteraVacia ? (
        <section className="card px-6 py-16 text-center">
          <p className="text-base font-semibold text-ink">Todavía no hay pagarés</p>
          <p className="mx-auto mt-1.5 max-w-prose text-sm text-muted">
            Cuando emitas el primero aparecerá aquí, con su folio y su estado. El sistema genera el
            folio, el importe en letra y el enlace de consulta.
          </p>
          <Link href="/pagares/nuevo" className="btn btn-primary mt-5">
            Emitir el primero
          </Link>
        </section>
      ) : (
        /* La tabla y sus filtros llegan juntos: la línea de conteo depende del
           resultado, así que mostrar los filtros antes daría un número falso. */
        <Suspense key={params.toString()} fallback={<TableSkeleton />}>
          <NotesList params={params} />
        </Suspense>
      )}
    </div>
  );
}

/** Enlace de descarga que se apaga —y explica por qué— cuando no hay nada que bajar. */
function DescargaBoton({
  href,
  habilitado,
  titulo,
  children,
}: {
  href: string;
  habilitado: boolean;
  titulo: string;
  children: React.ReactNode;
}) {
  if (!habilitado) {
    return (
      <span
        aria-disabled="true"
        title="No hay pagarés que descargar con los filtros puestos"
        className="btn btn-secondary cursor-not-allowed opacity-50"
      >
        <NavIcon.download />
        {children}
      </span>
    );
  }

  return (
    <a href={href} className="btn btn-secondary" title={titulo}>
      <NavIcon.download />
      {children}
    </a>
  );
}
