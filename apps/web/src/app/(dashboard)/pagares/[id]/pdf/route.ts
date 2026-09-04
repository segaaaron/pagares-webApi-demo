import { NextResponse } from 'next/server';
import { readSession } from '@/shared/auth/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface DownloadKind {
  path: (id: string, extra: string | null) => string;
  filename: string;
  /** El paquete legal es un zip; el resto, PDF (§17.1, §24.5). */
  contentType?: string;
  extension?: string;
  disposition?: 'inline' | 'attachment';
}

/** Qué documento sirve cada tipo, y con qué nombre se descarga (§17.1). */
const DOCUMENTS: Record<string, DownloadKind> = {
  note: { path: (id) => `/admin/notes/${id}/documents/note`, filename: 'pagare' },
  release: { path: (id) => `/admin/notes/${id}/documents/release`, filename: 'finiquito' },
  evidence: { path: (id) => `/admin/notes/${id}/documents/evidence`, filename: 'evidencia-firma' },
  receipt: {
    path: (id, paymentId) => `/admin/notes/${id}/documents/receipt/${paymentId ?? ''}`,
    filename: 'recibo',
  },
  'legal-package': {
    path: (id) => `/admin/notes/${id}/legal-package`,
    filename: 'paquete-legal',
    contentType: 'application/zip',
    extension: 'zip',
    // Un zip se guarda, no se abre en el visor del navegador.
    disposition: 'attachment',
  },
};

/**
 * Descarga de documentos. Pasa por el servidor web para que el token no viaje
 * al navegador: el cliente pide esta ruta, no la API (§9.2).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    // Se abre en una pestaña: un 401 en JSON deja al usuario sin dónde volver.
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { id } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'note';
  const paymentId = url.searchParams.get('paymentId');

  const document = DOCUMENTS[type];
  if (!document) return volverAlPagare(request, id, 'documento-desconocido');

  const upstream = await fetch(`${API_URL}/api/v1${document.path(id, paymentId)}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'No se pudo generar el documento' },
      { status: upstream.status },
    );
  }

  const extension = document.extension ?? 'pdf';
  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': document.contentType ?? 'application/pdf',
      'Content-Disposition': `${document.disposition ?? 'inline'}; filename="${document.filename}-${id}.${extension}"`,
      // Cuántas piezas trae y cuántas faltan, para poder avisarlo sin abrirlo.
      ...(upstream.headers.get('x-package-missing')
        ? { 'X-Package-Missing': upstream.headers.get('x-package-missing') as string }
        : {}),
    },
  });
}

/** De vuelta al pagaré con el motivo, en lugar de un cuerpo de error en pantalla. */
function volverAlPagare(request: Request, id: string, motivo: string): NextResponse {
  const destino = new URL(`/pagares/${id}`, request.url);
  destino.searchParams.set('aviso', motivo);
  return NextResponse.redirect(destino);
}
