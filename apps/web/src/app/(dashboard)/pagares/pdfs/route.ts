import { NextResponse } from 'next/server';
import { listNotes } from '@/features/notes/queries';
import { readSession } from '@/shared/auth/session';
import { todayInBusinessZone } from '@/shared/lib/today';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** El mismo tope que la API: cien PDFs son ~30 MB (§17.2). */
const MAX_NOTES = 100;

/**
 * Descarga masiva de los pagarés que hay en pantalla, en un zip (§17.2).
 *
 * Respeta los filtros de la URL, igual que la exportación a CSV: lo que se
 * descarga es lo que se está viendo. La alternativa real era abrir cien
 * pestañas y guardar una por una.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  params.set('limit', String(MAX_NOTES));
  const page = await listNotes(params);

  if (page.data.length === 0) {
    return NextResponse.json({ error: 'No hay pagarés con esos filtros' }, { status: 404 });
  }

  const ids = page.data.map((note) => note.id).join(',');
  const upstream = await fetch(
    `${API_URL}/api/v1/admin/documents/bundle?noteIds=${encodeURIComponent(ids)}`,
    { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' },
  );

  if (!upstream.ok) {
    return NextResponse.json({ error: 'No se pudo armar la descarga' }, { status: upstream.status });
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="pagares-${todayInBusinessZone()}.zip"`,
      // Cuántos entraron y cuántos fallaron, sin abrir el archivo.
      'X-Bundle-Included': upstream.headers.get('x-bundle-included') ?? '0',
      'X-Bundle-Failed': upstream.headers.get('x-bundle-failed') ?? '0',
    },
  });
}
