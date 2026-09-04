import { notFound } from 'next/navigation';
import { shortDate } from '@/shared/lib/format';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface PublicNote {
  folio: string;
  status: string;
  amount: string;
  balance: string;
  amountInWords: string;
  issueDate: string;
  dueDate: string;
  issuePlace: string;
  paymentPlace: string;
  creditorName: string;
  debtorName: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_SIGNATURE: 'Pendiente de firma',
  PROCESSING_SIGNATURE: 'Procesando firma',
  ISSUED: 'Vigente',
  PARTIALLY_PAID: 'Con abonos',
  OVERDUE: 'Vencido',
  PAID: 'Liquidado',
  RESTRUCTURED: 'En convenio',
  RENEWED: 'Renovado',
  WRITTEN_OFF: 'Dado de baja',
  VOID: 'Anulado',
};

export const metadata = { title: 'Consulta de pagaré' };

/**
 * Consulta pública sin login (§15).
 *
 * El token es de 128 bits: consultable, no enumerable. La API entrega una
 * proyección **sin domicilio, teléfono ni correo**, así que esta página no puede
 * filtrar datos personales aunque quisiera.
 */
export default async function PublicNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const response = await fetch(`${API_URL}/api/v1/public/notes/${token}`, { cache: 'no-store' });
  if (!response.ok) notFound();
  const note = (await response.json()) as PublicNote;

  const rows: [string, string][] = [
    ['Estado', STATUS_LABEL[note.status] ?? note.status],
    ['Saldo pendiente', note.balance],
    ['A favor de', note.creditorName],
    ['Suscriptor', note.debtorName],
    ['Expedido en', `${note.issuePlace} · ${shortDate(note.issueDate)}`],
    ['Lugar y fecha de pago', `${note.paymentPlace} · ${shortDate(note.dueDate)}`],
  ];

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <article className="card p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-accent-ink">Pagaré</p>
        <p className="mt-1 font-mono text-sm text-ink-2">{note.folio}</p>

        <p className="tnum mt-6 font-serif text-4xl font-semibold">{note.amount}</p>
        <p className="mt-1 text-sm text-muted">{note.amountInWords}</p>

        <dl className="mt-8 space-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-line pb-3 last:border-0">
              <dt className="text-muted">{label}</dt>
              <dd className="tnum text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </article>

      <p className="mt-4 text-center text-xs text-muted">
        Consulta de solo lectura. Para cualquier aclaración, comunícate con {note.creditorName}.
      </p>
    </main>
  );
}
