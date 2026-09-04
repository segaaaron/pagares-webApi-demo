import { NextResponse } from 'next/server';
import { api } from '@/shared/api/client';
import { csvResponse, toCsv } from '@/shared/lib/csv';
import { readSession } from '@/shared/auth/session';

interface AccountingExport {
  title: string;
  kind: 'portfolio' | 'payments';
  range: { from: string; to: string };
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string>[];
}

/**
 * Exportación contable de cartera y abonos (§17.2).
 *
 * A diferencia de los nueve reportes, esto **no agrega**: son las filas, con los
 * importes en pesos y punto decimal, para cuadrar contra las pólizas. Un total
 * redondeado no se cuadra con nada.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') return new Response('No autorizado', { status: 401 });

  const { kind } = await params;
  if (kind !== 'cartera' && kind !== 'abonos') return new Response('No existe', { status: 404 });

  const search = new URL(request.url).searchParams;
  const query = new URLSearchParams({ kind: kind === 'abonos' ? 'payments' : 'portfolio' });
  for (const key of ['from', 'to'] as const) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }

  let data: AccountingExport;
  try {
    data = await api<AccountingExport>(`/admin/reports/accounting?${query.toString()}`);
  } catch {
    const destino = new URL('/reportes', request.url);
    destino.searchParams.set('aviso', 'descarga-fallida');
    return NextResponse.redirect(destino);
  }
  const csv = toCsv(
    data.columns.map((column) => column.label),
    data.rows.map((row) => data.columns.map((column) => row[column.key] ?? '')),
  );

  return csvResponse(`contable-${kind}-${data.range.to}`, csv);
}
