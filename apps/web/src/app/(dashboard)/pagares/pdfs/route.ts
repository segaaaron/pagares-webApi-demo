import { NextResponse } from 'next/server';
import { listNotes } from '@/features/notes/queries';
import { readSession } from '@/shared/auth/session';
import { todayInBusinessZone } from '@/shared/lib/today';
import { fetchConLimite, PLAZO } from '@/shared/lib/fetch-con-limite';

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
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const params = new URL(request.url).searchParams;
  params.set('limit', String(MAX_NOTES));
  const page = await listNotes(params);

  /**
   * Nada que empaquetar: se vuelve a la cartera con el motivo, no a un JSON.
   *
   * Esta ruta se abre en una pestaña —es una descarga—, así que un cuerpo de
   * error deja al administrador mirando un objeto crudo en pantalla, sin
   * navegación y sin saber qué hacer. La respuesta útil es devolverlo a donde
   * estaba, con el aviso puesto.
   */
  if (page.data.length === 0) {
    return redireccionConAviso(request, 'sin-pagares');
  }

  const ids = page.data.map((note) => note.id).join(',');
  const upstream = await fetchConLimite(
    `${API_URL}/api/v1/admin/documents/bundle?noteIds=${encodeURIComponent(ids)}`,
    { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' },
    // Cien PDFs comprimidos de dos en dos: es la descarga más lenta que hay.
    PLAZO.documento,
  );

  if (!upstream.ok) {
    return redireccionConAviso(request, 'descarga-fallida');
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

/** De vuelta a la cartera conservando los filtros, con el motivo en la URL. */
function redireccionConAviso(request: Request, motivo: string): Response {
  const destino = new URL('/pagares', request.url);
  for (const [clave, valor] of new URL(request.url).searchParams) {
    if (clave !== 'limit') destino.searchParams.set(clave, valor);
  }
  destino.searchParams.set('aviso', motivo);
  return NextResponse.redirect(destino);
}
