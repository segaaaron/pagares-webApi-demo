import { api, ApiError } from '@/shared/api/client';
import { readSession } from '@/shared/auth/session';

/**
 * Vista previa del correo de una regla, servida como documento (§24.5).
 *
 * El HTML se sirve por su propia ruta y el iframe la carga con `sandbox`. La
 * alternativa —devolverlo por la Server Action y pintarlo con `srcDoc`— metía el
 * documento entero en el estado del cliente y colgaba el navegador: un correo es
 * un documento, y los documentos se cargan, no se serializan en un estado de
 * React.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rule: string }> },
): Promise<Response> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') return new Response('No autorizado', { status: 401 });

  const { rule } = await params;

  try {
    const preview = await api<{ subject: string; html: string }>(
      `/admin/reminder-rules/${rule}/preview`,
      { method: 'POST', body: { sendTest: false } },
    );

    return new Response(preview.html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Es una maqueta: nada de scripts ni de peticiones a ningún sitio.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return new Response('No se pudo generar la vista previa', { status });
  }
}
