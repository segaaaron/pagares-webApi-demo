import Link from 'next/link';
import { Suspense } from 'react';
import { listNotes } from '@/features/notes/queries';
import { NotesFilters } from '@/features/notes/filters';
import { NotesTable } from '@/features/notes/notes-table';
import { TableSkeleton } from '@/shared/ui/table-skeleton';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { Pagination } from '@/shared/ui/pagination';
import { PageHeader } from '@/shared/ui/page-header';

export const metadata = { title: 'Pagarés' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
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

export default async function NotesPage({ searchParams }: PageProps) {
  const params = toParams(await searchParams);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Pagarés' }]}
        title="Pagarés"
        description="Ordenados por vencimiento: lo que vence primero, primero."
        actions={
          <>
            <a href={`/pagares/exportar?${params.toString()}`} className="btn btn-secondary">
              <NavIcon.download />
              Exportar CSV
            </a>
            {/* Los PDFs de lo que se está viendo, en un zip (§17.2): con los
                filtros puestos, es "los pagarés de este deudor" sin abrir cien
                pestañas. */}
            <a
              href={`/pagares/pdfs?${params.toString()}`}
              className="btn btn-secondary"
              title="Los pagarés filtrados, en PDF y comprimidos (máximo 100)"
            >
              <NavIcon.download />
              PDFs en zip
            </a>
            <Link href="/pagares/nuevo" className="btn btn-primary">
              Emitir pagaré
            </Link>
          </>
        }
      />

      {/* La tabla y sus filtros llegan juntos: la línea de conteo depende del
          resultado, así que mostrar los filtros antes daría un número falso. */}
      <Suspense key={params.toString()} fallback={<TableSkeleton />}>
        <NotesList params={params} />
      </Suspense>
    </div>
  );
}
