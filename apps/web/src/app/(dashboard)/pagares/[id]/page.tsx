import Link from 'next/link';
import { RouteNotice } from '@/shared/ui/route-notice';
import { notFound } from 'next/navigation';
import { getNote } from '@/features/notes/detail-queries';
import { PaymentForm } from '@/features/notes/payment-form';
import { NoteActions } from '@/features/notes/note-actions';
import { SettlementPanel, ReinstatePanel } from '@/features/notes/settlement-panel';
import { LegalPanel } from '@/features/notes/legal-panel';
import { Simulator } from '@/features/notes/simulator';
import { SendDocument } from '@/features/notes/send-document';
import { STATUS_PRESENTATION } from '@/entities/note/status';
import { dateTime, shortDate } from '@/shared/lib/format';
import { todayInBusinessZone } from '@/shared/lib/today';
import { ApiError } from '@/shared/api/client';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { PageHeader } from '@/shared/ui/page-header';

export const metadata = { title: 'Detalle del pagaré' };

const ACTIVITY_TYPE: Record<string, string> = {
  CALL: 'Llamada',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Correo',
  VISIT: 'Visita',
  OTHER: 'Otro',
};

const ACTIVITY_OUTCOME: Record<string, string> = {
  NO_ANSWER: 'no contestó',
  PROMISED: 'prometió pagar',
  REFUSED: 'se negó',
  PAID: 'ya pagó',
  DISPUTED: 'disputa el adeudo',
};

/** La bitácora se muestra en palabras, no con el identificador técnico. */
const AUDIT_LABEL: Record<string, string> = {
  'note.issue': 'Pagaré emitido',
  'note.sign': 'Firmado por el cliente',
  'note.void': 'Anulado',
  'note.write-off': 'Dado de baja',
  'note.reinstate': 'Castigo revertido',
  'note.extend': 'Prórroga registrada',
  'note.renew': 'Renovado',
  'payment.register': 'Abono registrado',
  'payment.void': 'Abono anulado',
  'settlement.create': 'Convenio registrado',
  'settlement.fulfilled': 'Convenio cumplido',
  'settlement.broken': 'Convenio incumplido',
  'legal.open_case': 'Expediente judicial abierto',
  'legal.custody': 'Ubicación del documento actualizada',
};

/** Motivo por el que el estado actual no admite abonos (§19.5). */
function paymentBlockedReason(status: string): string | undefined {
  switch (status) {
    case 'PAID':
      return 'el pagaré ya está liquidado';
    case 'VOID':
      return 'el pagaré fue anulado';
    case 'RENEWED':
      return 'fue sustituido por una renovación';
    case 'PENDING_SIGNATURE':
    case 'PROCESSING_SIGNATURE':
      return 'todavía no está firmado';
    default:
      return undefined;
  }
}


/** Motivos con los que una descarga devuelve al administrador a esta pantalla. */
const AVISOS: Record<string, { tone: 'warning' | 'error'; message: string }> = {
  'documento-desconocido': { tone: 'error', message: 'Ese documento no existe.' },
  'estado-cuenta-fallido': {
    tone: 'error',
    message: 'No se pudo generar el estado de cuenta. Inténtalo de nuevo en un momento.',
  },
};

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const consulta = await searchParams;
  const aviso = typeof consulta['aviso'] === 'string' ? AVISOS[consulta['aviso']] : undefined;

  let note;
  try {
    note = await getNote(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const presentation = STATUS_PRESENTATION[note.status];
  const today = todayInBusinessZone();
  const blockedReason = paymentBlockedReason(note.status);

  // Porcentaje cobrado sobre el importe original, en enteros.
  const amountCents = BigInt(note.amount.cents);
  const paidShare =
    amountCents > 0n ? Number((BigInt(note.paid.cents) * 100n) / amountCents) : 0;

  return (
    <div className="space-y-5">
      {aviso ? <RouteNotice tone={aviso.tone} message={aviso.message} /> : null}
      <PageHeader
        crumbs={[{ label: 'Pagarés', href: '/pagares' }, { label: note.folio }]}
        title={note.debtor.fullName}
        badge={
          <>
            <span className="chip bg-surface-2 font-mono text-[11px] text-ink-2">{note.folio}</span>
            <span className={`chip ${presentation.chip}`}>{presentation.label}</span>
          </>
        }
        description={presentation.description}
        actions={
          <>
            {/* Emitir otro al mismo deudor sin volver a teclear sus datos (§19.6). */}
            <Link
              href={`/pagares/nuevo?duplicar=${note.id}`}
              className="btn btn-secondary"
              title="Emitir otro pagaré con estos mismos datos"
            >
              Duplicar
            </Link>
            <a
              href={`/pagares/${note.id}/pdf?type=note`}
              target="_blank"
              rel="noopener"
              className="btn btn-primary"
            >
              <NavIcon.download />
              Descargar pagaré
            </a>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* El documento: se lee como un pagaré, no como un formulario. */}
        {/*
          * El documento se lee como un pagaré, no como una ficha: la trama
          * diagonal, el importe en número y letra, las menciones que pide la
          * Ley General de Títulos y Operaciones de Crédito y la firma
          * superpuesta sobre su línea. Es la misma pieza que ve el cliente en
          * el PDF, así que reconocer una es reconocer la otra.
          */}
        <section className="card relative overflow-hidden p-0" aria-label="Documento">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(115deg, var(--color-accent) 0 1px, transparent 1px 14px)',
            }}
            aria-hidden
          />

          <header className="relative flex items-center justify-between bg-accent px-6 py-3 text-white">
            <p className="font-serif text-sm font-semibold tracking-[0.28em]">PAGARÉ</p>
            <p className="font-mono text-[11px] tracking-[0.14em] text-white/80">{note.folio}</p>
          </header>

          <div className="relative px-6 py-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Importe</p>
            <p className="tnum mt-1 font-serif text-4xl font-semibold leading-none">
              {note.amount.formatted}
            </p>
            <p className="mt-2 font-serif text-sm italic text-ink-2">{note.amountInWords}</p>

            <p className="mt-5 border-t border-line pt-4 font-serif text-sm text-ink-2">
              Debo(emos) y pagaré(mos) incondicionalmente a la orden de{' '}
              <span className="font-semibold text-ink">{note.creditorName}</span> la cantidad
              anotada, en el lugar y fecha de pago señalados.
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              {[
                ['Suscriptor', note.debtor.fullName],
                ['Domicilio del deudor', note.debtor.address],
                ['Expedido en', `${note.issuePlace} · ${shortDate(note.issueDate)}`],
                ['Lugar y fecha de pago', `${note.paymentPlace} · ${shortDate(note.dueDate)}`],
                ['Interés moratorio', note.interestRateLabel],
                ['Prescribe', note.prescribesOn ? shortDate(note.prescribesOn) : '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {/* Avales: cada uno con su línea, porque cada uno firma por su
                cuenta y responde igual que el suscriptor. */}
            {note.guarantors.length > 0 ? (
              <div className="mt-8 border-t border-line pt-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  Por aval
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {note.guarantors.map((guarantor) => (
                    <div key={guarantor.position}>
                      <p className="text-sm font-medium text-ink">{guarantor.fullName}</p>
                      <p className="text-xs text-muted">
                        {guarantor.address} · {guarantor.phone}
                      </p>
                      <p className={`mt-1 text-xs ${guarantor.signedAt ? 'text-ok' : 'text-warn'}`}>
                        {guarantor.signedAt
                          ? `Firmó el ${dateTime(guarantor.signedAt)}`
                          : 'Pendiente de firma'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* La firma va sobre su línea, como en el papel. */}
            <div className="mt-10 flex justify-end">
              <div className="w-72 text-center">
                {note.signature ? (
                  <img
                    src={note.signature.url}
                    alt={`Firma de ${note.debtor.fullName}`}
                    className="mx-auto -mb-2 h-20 w-auto"
                  />
                ) : (
                  <p className="-mb-1 pb-3 text-xs italic text-muted">Pendiente de firma</p>
                )}
                <div className="border-t border-ink-2" />
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  Firma del suscriptor
                </p>
                {note.signature ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    {dateTime(note.signature.capturedAt)} ·{' '}
                    {note.signature.mode === 'IN_PERSON' ? 'presencial' : 'remota'}
                    {note.signature.deviceModel ? ` · ${note.signature.deviceModel}` : ''}
                    <br />
                    <span className="font-mono">SHA-256 {note.signature.sha256.slice(0, 16)}…</span>
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* La operación */}
        <div className="space-y-4">
          <section className="card p-4" aria-label="Resumen">
            <h2 className="mb-3 text-sm font-semibold">Resumen</h2>

            {/* Avance del cobro: la pregunta de "cuánto llevamos" contestada
                sin hacer la división mentalmente. */}
            <div className="mb-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">Cobrado</span>
                <span className="tnum font-medium text-ink">{paidShare}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full ${paidShare >= 100 ? 'bg-ok' : 'bg-accent'}`}
                  style={{ width: `${Math.min(paidShare, 100)}%` }}
                />
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              {[
                ['Importe', note.amount.formatted, ''],
                ['Abonado', note.paid.formatted, 'text-muted'],
                ['Interés devengado', note.accruedInterest.formatted, 'text-warn'],
                ['Saldo', note.balance.formatted, 'font-semibold'],
              ].map(([label, value, cls]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className={`tnum ${cls}`}>{value}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="text-muted">Atraso</dt>
                <dd className="tnum">
                  {note.daysOverdue > 0 ? `${note.daysOverdue} días` : 'Al corriente'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Cartera</dt>
                <dd>{note.portfolioClass === 'VENCIDA' ? 'Vencida (90+)' : 'Vigente'}</dd>
              </div>
              {note.prescribesOn ? (
                <div className="flex justify-between">
                  <dt className="text-muted">Prescribe</dt>
                  <dd className="tnum">{shortDate(note.prescribesOn)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <PaymentForm
            noteId={note.id}
            today={today}
            {...(blockedReason !== undefined ? { disabledReason: blockedReason } : {})}
          />

          <NoteActions
            noteId={note.id}
            folio={note.folio}
            status={note.status}
            balanceLabel={note.balance.formatted}
            today={today}
            hasEmail={note.debtor.email !== null}
          />

          {note.settlement ? <SettlementPanel noteId={note.id} settlement={note.settlement} /> : null}
          {note.status === 'WRITTEN_OFF' ? <ReinstatePanel noteId={note.id} /> : null}

          {/* El simulador va junto a los abonos: la pregunta "cuánto debe si
              paga el viernes" se hace justo antes de registrar el pago (§24.5). */}
          <Simulator noteId={note.id} today={today} />

          {/* Todo lo descargable en un sitio (§17.1). Lo que aún no existe se
              deshabilita con el motivo, no se esconde: así se sabe que existe
              y qué falta para tenerlo (§19.5). */}
          <section className="card p-4" aria-label="Documentos">
            <h2 className="mb-3 text-sm font-semibold">Documentos</h2>
            <ul className="space-y-1.5">
              <DocumentRow
                label="Pagaré"
                hint="El título con la firma incrustada"
                href={`/pagares/${note.id}/pdf?type=note`}
              />
              <DocumentRow
                label="Certificado de evidencia de firma"
                hint={
                  note.signature
                    ? 'Hashes, dispositivo y momento de la firma'
                    : 'Disponible cuando el cliente firme'
                }
                href={note.signature ? `/pagares/${note.id}/pdf?type=evidence` : null}
              />
              <DocumentRow
                label="Estado de cuenta del deudor"
                hint="Todos sus pagarés y abonos, al corte de hoy"
                href={`/clientes/${note.debtor.id}/estado-cuenta`}
              />
              <DocumentRow
                label="Carta de finiquito"
                hint={
                  note.status === 'PAID'
                    ? 'Constancia de pago total'
                    : 'Disponible cuando quede liquidado'
                }
                href={note.status === 'PAID' ? `/pagares/${note.id}/pdf?type=release` : null}
              />
              <DocumentRow
                label="Paquete legal (zip)"
                hint="Pagaré, certificado, estado de cuenta, bitácora y escaneos"
                href={`/pagares/${note.id}/pdf?type=legal-package`}
              />
              <DocumentRow
                label={`Recibos de abono (${note.payments.length})`}
                hint={
                  note.payments.length > 0
                    ? 'Uno por abono, en la lista de abonos'
                    : 'Se generan al registrar el primer abono'
                }
                href={null}
              />
            </ul>

            <SendDocument noteId={note.id} settled={note.status === 'PAID'} />
          </section>

          <section className="card p-4" aria-label="Abonos">
            <h2 className="mb-3 text-sm font-semibold">Abonos ({note.payments.length})</h2>
            {note.payments.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay abonos registrados.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {note.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between py-2">
                    <div>
                      <p className="tnum font-medium">{p.amount}</p>
                      <p className="text-xs text-muted">
                        {shortDate(p.paidOn)} · {p.method}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p className="tnum">Capital {p.appliedToPrincipal}</p>
                      <p className="tnum">Interés {p.appliedToInterest}</p>
                      {!p.isReversal ? (
                        <a href={`/pagares/${note.id}/pdf?type=receipt&paymentId=${p.id}`}
                           target="_blank" rel="noopener"
                           className="text-accent-ink hover:underline">
                          Recibo
                        </a>
                      ) : (
                        <span className="text-crit">Reversa</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {note.activities.length > 0 ? (
            <section className="card p-4" aria-label="Gestión">
              <h2 className="mb-3 text-sm font-semibold">Gestión ({note.activities.length})</h2>
              <ul className="divide-y divide-line text-sm">
                {note.activities.map((a) => (
                  <li key={a.id} className="py-2">
                    <p className="font-medium">
                      {ACTIVITY_TYPE[a.type] ?? a.type} · {ACTIVITY_OUTCOME[a.outcome] ?? a.outcome}
                    </p>
                    {a.promisedOn ? (
                      <p className="text-xs text-warn">Prometió pagar el {shortDate(a.promisedOn)}</p>
                    ) : null}
                    {a.notes ? <p className="text-xs text-muted">{a.notes}</p> : null}
                    <p className="text-xs text-muted">{dateTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <LegalPanel
            noteId={note.id}
            legalCase={note.legalCase}
            physicalDocumentLocation={note.physicalDocumentLocation}
            today={today}
          />

          {note.audit.length > 0 ? (
            <section className="card p-4" aria-label="Historial">
              <h2 className="mb-1 text-sm font-semibold">Historial</h2>
              <p className="mb-3 text-xs text-muted">
                Bitácora encadenada: cada registro incluye el hash del anterior.
              </p>
              <ul className="divide-y divide-line text-sm">
                {note.audit.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 py-2">
                    <span>{AUDIT_LABEL[a.action] ?? a.action}</span>
                    <span className="shrink-0 text-xs text-muted">{dateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}


/**
 * Fila de documento. Sin `href` queda deshabilitada con el motivo a la vista:
 * ocultarla haría creer que ese documento no existe en el sistema (§19.5).
 */
function DocumentRow({
  label,
  hint,
  href,
}: {
  label: string;
  hint: string;
  href: string | null;
}) {
  const body = (
    <>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${href ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted'}`} aria-hidden>
        <NavIcon.document />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${href ? 'font-medium text-ink' : 'text-muted'}`}>
          {label}
        </span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      {href ? <NavIcon.download /> : null}
    </>
  );

  return (
    <li>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent-soft/50"
        >
          {body}
        </a>
      ) : (
        <span aria-disabled className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2 opacity-70" title={hint}>
          {body}
        </span>
      )}
    </li>
  );
}
