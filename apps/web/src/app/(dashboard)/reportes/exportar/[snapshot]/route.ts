import { notFound } from 'next/navigation';
import { getPortfolio } from '@/features/reports/queries';
import { csvResponse, toCsv } from '@/shared/lib/csv';
import { readSession } from '@/shared/auth/session';

/**
 * Los dos reportes de foto fija: cartera y antigüedad **al corte de hoy**.
 *
 * No llevan rango de fechas porque no lo tienen: son el estado del saldo hoy,
 * no un periodo. En pantalla viven en Cartera; aquí sólo se exportan, que es lo
 * que hace falta para contabilidad o para mandarlos por correo.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshot: string }> },
): Promise<Response> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') return new Response('No autorizado', { status: 401 });

  const { snapshot } = await params;
  const report = await getPortfolio();

  if (snapshot === 'cartera') {
    const csv = toCsv(
      ['Concepto', 'Pagarés', 'Importe'],
      [
        ['Saldo por cobrar', String(report.totals.activeNotes), report.totals.outstandingFormatted],
        ['Vencido', String(report.totals.overdueNotes), report.totals.overdueFormatted],
        ['Cartera vencida (90+)', '', report.totals.nonPerformingFormatted],
        ['Cobrado este mes', '', report.totals.collectedThisMonthFormatted],
        ...report.mix.map((slice) => [slice.label, String(slice.count), slice.balanceFormatted]),
      ],
    );
    return csvResponse(`cartera-al-${report.asOf}`, csv);
  }

  if (snapshot === 'antiguedad') {
    const csv = toCsv(
      ['Tramo', 'Pagarés', 'Saldo'],
      report.aging.map((bucket) => [bucket.label, String(bucket.count), bucket.balanceFormatted]),
    );
    return csvResponse(`antiguedad-al-${report.asOf}`, csv);
  }

  notFound();
}
