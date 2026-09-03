import { api } from '@/shared/api/client';
import { csvResponse, toCsv } from '@/shared/lib/csv';
import { readSession } from '@/shared/auth/session';

interface OperationalReport {
  title: string;
  range: { from: string; to: string };
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string>[];
}

/**
 * Exportación del reporte tal y como se está viendo (§17.2).
 *
 * Respeta el rango de la URL, así que lo que se descarga es exactamente lo que
 * hay en pantalla: si el archivo dijera otra cosa que la vista, nadie volvería
 * a fiarse de ninguno de los dos.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
): Promise<Response> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') return new Response('No autorizado', { status: 401 });

  const { report } = await params;
  const search = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['from', 'to'] as const) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }

  const data = await api<OperationalReport>(`/admin/reports/${report}?${query.toString()}`);
  const csv = toCsv(
    data.columns.map((column) => column.label),
    data.rows.map((row) => data.columns.map((column) => row[column.key] ?? '')),
  );

  return csvResponse(`${report}-${data.range.from}-a-${data.range.to}`, csv);
}
