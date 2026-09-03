import { NextResponse } from 'next/server';
import { listNotes } from '@/features/notes/queries';
import { readSession } from '@/shared/auth/session';
import { todayInBusinessZone } from '@/shared/lib/today';
import { csvResponse, toCsv } from '@/shared/lib/csv';

/** Escapa un campo para CSV: comillas dobladas y envoltura si hace falta. */

/**
 * Exportación de la cartera a CSV, respetando los filtros de la URL.
 *
 * Se emite con BOM y separador `;` porque Excel en español interpreta la coma
 * como decimal: sin eso, "$25,000.00" rompe las columnas al abrirlo.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  params.set('limit', '100');

  const headers = [
    'Folio',
    'Deudor',
    'Estado',
    'Importe',
    'Abonado',
    'Saldo',
    'Vencimiento',
    'Días de atraso',
    'Cartera',
    'Tramo',
  ];

  const rows: string[][] = [];
  let cursor: string | null = null;
  let pages = 0;

  // Se pagina hasta agotar el filtro; el tope evita una descarga infinita.
  do {
    if (cursor) params.set('cursor', cursor);
    const page = await listNotes(params);

    for (const note of page.data) {
      rows.push([
        note.folio,
        note.debtorName,
        note.status,
        note.amount.formatted,
        note.paid.formatted,
        note.balance.formatted,
        note.dueDate,
        String(note.daysOverdue),
        note.portfolioClass,
        note.agingBucket,
      ]);
    }

    cursor = page.page.nextCursor;
    pages += 1;
  } while (cursor && pages < 50);

  return csvResponse(`pagares-${todayInBusinessZone()}`, toCsv(headers, rows));
}
