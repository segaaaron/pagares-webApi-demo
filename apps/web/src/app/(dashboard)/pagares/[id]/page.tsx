import Link from 'next/link';
import { RouteNotice } from '@/shared/ui/route-notice';
import { notFound } from 'next/navigation';
import { getNote, type NoteDetail } from '@/features/notes/detail-queries';
import { PaymentForm } from '@/features/notes/payment-form';
import { NoteActions } from '@/features/notes/note-actions';
import { SettlementPanel, ReinstatePanel } from '@/features/notes/settlement-panel';
import { LegalPanel } from '@/features/notes/legal-panel';
import { getCustodyLog } from '@/features/notes/custody-queries';
import { ForgiveRemainder } from '@/features/notes/forgive-remainder';
import { getSettlementToleranceCents } from '@/features/settings/queries';
import { Simulator } from '@/features/notes/simulator';
import { EarlyPayoff } from '@/features/notes/early-payoff';
import { SendDocument } from '@/features/notes/send-document';
import { STATUS_PRESENTATION } from '@/entities/note/status';
import { StatusChip } from '@/shared/ui/status-chip';
import { dateTime, money, shortDate } from '@/shared/lib/format';
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

  // La bitácora de custodia va aparte y nunca tumba el detalle: si no responde,
  // llega vacía (§13.6).
  const [custody, toleranceCents] = await Promise.all([
    getCustodyLog(id),
    getSettlementToleranceCents(),
  ]);

  // ¿Sobra un resto que cabe en la tolerancia? El servidor lo vuelve a comprobar
  // antes de condonar; esto sólo decide si se ofrece.
  const toleranciaCents = BigInt(toleranceCents || '0');
  const saldoCents = BigInt(note.balance.cents);
  const puedeCerrarse = toleranciaCents > 0n && saldoCents > 0n && saldoCents <= toleranciaCents;

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
            {/*
              * Emitir otro al mismo deudor sin volver a teclear sus datos
              * (§19.6) — salvo mientras éste siga sin firma: no se le emite
              * otro pagaré a quien no ha firmado el anterior (ADR 0019). El
              * botón se queda a la vista, apagado y con el motivo, en vez de
              * desaparecer y dejar al administrador buscándolo (§19.5).
              */}
            {note.status === 'PENDING_SIGNATURE' || note.status === 'PROCESSING_SIGNATURE' ? (
              <span
                aria-disabled="true"
                className="btn btn-secondary cursor-not-allowed opacity-50"
                title="Primero hay que firmar este pagaré: hasta entonces no se le emite otro al mismo deudor"
              >
                Duplicar
              </span>
            ) : (
              <Link
                href={`/pagares/nuevo?duplicar=${note.id}`}
                className="btn btn-secondary"
                title="Emitir otro pagaré con estos mismos datos"
              >
                Duplicar
              </Link>
            )}
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

      {/*
        * `items-start`: sin él las dos columnas crecen hasta la altura de la
        * más alta, y el documento se estiraba con un palmo de trama en blanco
        * debajo de la firma sólo porque la operación tenía más tarjetas.
        */}
      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* El documento: se lee como un pagaré, no como un formulario. */}
        {/*
          * El documento se lee como un pagaré, no como una ficha: la trama
          * diagonal, el importe en número y letra, las menciones que pide la
          * Ley General de Títulos y Operaciones de Crédito y la firma
          * superpuesta sobre su línea. Es la misma pieza que ve el cliente en
          * el PDF, así que reconocer una es reconocer la otra.
          */}
        <section className="card relative overflow-hidden p-0" aria-label="Documento">
          {/*
            * Papel de seguridad: dos tramas finas cruzadas, como el guilloché
            * del talonario impreso. Es lo primero que hace reconocible el
            * documento antes de leer una sola palabra.
            */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(115deg, var(--color-accent) 0 1px, transparent 1px 7px), repeating-linear-gradient(65deg, var(--color-accent) 0 1px, transparent 1px 9px)',
            }}
            aria-hidden
          />

          <div className="relative px-6 py-6">
            {/* Cabecera del talonario: el título encajonado y, a su derecha,
                dónde y cuándo se expidió. */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="border-2 border-ink px-4 py-2">
                <p className="font-serif text-xl font-semibold leading-none text-ink">Pagaré</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-end justify-end gap-x-6 gap-y-3">
                <Campo etiqueta="Lugar y fecha de expedición" ancho="min-w-[16rem]">
                  {note.issuePlace} · {shortDate(note.issueDate)}
                </Campo>
                <Campo etiqueta="Folio" ancho="min-w-[9rem]">
                  <span className="tnum font-mono text-sm">{note.folio}</span>
                </Campo>
              </div>
            </div>

            {/* El cuerpo, con la redacción del formulario impreso y los datos
                sobre la línea donde irían escritos a mano. */}
            <div className="mt-7 space-y-4 font-serif text-[15px] leading-relaxed text-ink-2">
              <p className="flex flex-wrap items-end gap-x-2 gap-y-3">
                <span>Debo y pagaré incondicionalmente por este pagaré a la orden de</span>
                <Campo etiqueta="Nombre de la persona a quien ha de pagarse" ancho="min-w-[18rem]">
                  {note.creditorName}
                </Campo>
              </p>

              <p className="flex flex-wrap items-end gap-x-2 gap-y-3">
                <span>en</span>
                <Campo etiqueta="Lugar de pago" ancho="min-w-[12rem]">
                  {note.paymentPlace}
                </Campo>
                <span>el día</span>
                <Campo etiqueta="Fecha de pago" ancho="min-w-[10rem]">
                  {shortDate(note.dueDate)}
                </Campo>
              </p>

              <p className="flex flex-wrap items-end gap-x-2 gap-y-3">
                <span>la cantidad de</span>
                <Campo etiqueta="Importe con letra" ancho="min-w-[22rem]">
                  <span className="italic">{note.amountInWords}</span>
                </Campo>
              </p>
            </div>

            {/* El importe en cifra, encajonado como en el talonario: es lo que
                se compara de un vistazo contra el efectivo. */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y-2 border-ink py-3">
              <p className="tnum font-serif text-3xl font-semibold leading-none text-ink">
                {note.amount.formatted}
              </p>
              <p className="max-w-md text-xs text-ink-2">
                Desde la fecha de vencimiento y hasta su liquidación, este pagaré causará un interés
                moratorio de <span className="font-semibold">{note.interestRateLabel}</span>.
              </p>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-[1.2fr_1fr]">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  Datos del suscriptor
                </p>
                <div className="mt-3 space-y-3">
                  <Campo etiqueta="Nombre" ancho="w-full">
                    {note.debtor.fullName}
                  </Campo>
                  <Campo etiqueta="Dirección" ancho="w-full">
                    {note.debtor.address}
                  </Campo>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ['Prescribe', note.prescribesOn ? shortDate(note.prescribesOn) : '—'],
                    // Cómo circula el título: quien lo tenga puede endosarlo, o
                    // no. Decide quién puede acabar cobrándolo.
                    [
                      'Forma del título',
                      note.negotiable ? 'A la orden (endosable)' : 'No a la orden',
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* La firma, encajonada como en el papel y sobre su línea. */}
              <div className="border border-line-strong p-3 text-center">
                {note.signature ? (
                  <img
                    src={note.signature.url}
                    alt={`Firma de ${note.debtor.fullName}`}
                    className="mx-auto -mb-2 h-20 w-auto"
                  />
                ) : (
                  <p className="-mb-1 pb-3 pt-6 text-xs italic text-muted">Pendiente de firma</p>
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

            {/*
              * Los avales, encajonados al pie como en el talonario, pero **sin
              * espacio de firma**: el sistema no tiene forma de capturarla, y
              * una línea vacía prometía un paso que nunca llega. Sus datos sí
              * van, que es lo que hace identificable a quien se obliga.
              */}
            {note.guarantors.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {note.guarantors.map((guarantor) => (
                  <div key={guarantor.position} className="border border-line-strong p-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                      Aval
                    </p>
                    <div className="mt-3 space-y-3">
                      <Campo etiqueta="Nombre" ancho="w-full">
                        {guarantor.fullName}
                      </Campo>
                      <Campo etiqueta="Dirección" ancho="w-full">
                        {guarantor.address}
                      </Campo>
                      <Campo etiqueta="Teléfono" ancho="w-full">
                        {guarantor.phone}
                      </Campo>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/*
          * La operación se queda a la vista mientras se lee el documento: es
          * desde donde se registra el abono, y bajarla a buscarla cada vez es
          * el viaje que hace el administrador cuarenta veces al día. Con su
          * propio scroll cuando no cabe, para no arrastrar la página entera.
          */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1">
          {/*
            * La serie, cuando la deuda se firmó en varios pagarés. Va lo primero
            * porque cambia cómo se lee todo lo de abajo: este saldo es el de una
            * cuota, no el de la deuda entera.
            */}
          {note.series ? <SeriePagares serie={note.series} actual={note.id} /> : null}

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
            {/*
              * De qué está hecha la cuota (§12, ADR 0020).
              *
              * El deudor firma un pagaré de $6,027.73 y hasta ahora nadie podía
              * decirle —ni él ver— que $1,800 de esos son el precio del
              * préstamo. Va justo encima del saldo, que es donde se mira.
              */}
            {note.breakdown ? (
              <div className="mb-4 rounded-lg bg-surface-2 px-3 py-2.5">
                <p className="text-xs font-medium text-ink">De esta cuota</p>
                <dl className="mt-1.5 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted">Interés del préstamo</dt>
                    <dd className="tnum text-ink">{note.breakdown.interest.formatted}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Capital</dt>
                    <dd className="tnum text-ink">{note.breakdown.principal.formatted}</dd>
                  </div>
                </dl>
                {BigInt(note.breakdown.interestPending.cents) > 0n ? (
                  <p className="mt-1.5 text-xs text-muted">
                    Quedan {note.breakdown.interestPending.formatted} de ese interés por cubrir.
                    El moratorio no corre sobre esa parte.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">
                    El interés de esta cuota ya está cubierto.
                  </p>
                )}
              </div>
            ) : null}

            <dl className="space-y-2 text-sm">
              {[
                ['Importe', note.amount.formatted, ''],
                ['Abonado', note.paid.formatted, 'text-muted'],
                ['Interés moratorio', note.accruedInterest.formatted, 'text-warn'],
                // La equivalencia anual vive aquí y no en el documento: sirve
                // para comparar cartera, y en el título sería un número que
                // nadie firmó.
                ['Tasa moratoria', note.interestRateOperationalLabel, 'text-ink-2'],
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

          {/* Sólo si sobra un resto y cabe en la tolerancia: sin ella configurada,
              esto no aparece nunca y nadie condona nada por omisión. */}
          {blockedReason === undefined && puedeCerrarse ? (
            <ForgiveRemainder noteId={note.id} balanceLabel={note.balance.formatted} />
          ) : null}

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

          {/* Liquidar la serie de una vez es otra pregunta que la del abono del
              viernes, y con otra respuesta: aquí puede haber interés que no se
              causa (§12). Sólo aparece cuando hay más de un pagaré que saldar. */}
          {note.series ? <EarlyPayoff noteId={note.id} today={today} /> : null}

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
                        {shortDate(p.paidOn)} · {p.isWaiver ? 'Condonación' : p.method}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </p>
                      {/* Un asiento que cierra el pagaré sin que entrara dinero
                          tiene que decirlo: si no, parece cobranza. */}
                      {p.isWaiver ? (
                        <p className="text-xs text-warn">
                          Remanente condonado para cerrar. No entró dinero: va como pérdida.
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p className="tnum">Capital {p.appliedToPrincipal}</p>
                      {/* El precio del préstamo y la sanción por atraso van
                          separados: juntarlos impedía saber qué se cobró
                          (ADR 0020). */}
                      <p className="tnum">Interés del préstamo {p.appliedToOrdinaryInterest}</p>
                      <p className="tnum">Moratorio {p.appliedToInterest}</p>
                      {!p.isReversal && !p.isWaiver ? (
                        <a href={`/pagares/${note.id}/pdf?type=receipt&paymentId=${p.id}`}
                           target="_blank" rel="noopener"
                           className="text-accent-ink hover:underline">
                          Recibo
                        </a>
                      ) : p.isReversal ? (
                        <span className="text-crit">Reversa</span>
                      ) : (
                        <span className="text-warn">Sin recibo</span>
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

          <LegalPanel noteId={note.id} legalCase={note.legalCase} custody={custody} today={today} />

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

/**
 * Un dato sobre su línea, con la etiqueta debajo en letra pequeña.
 *
 * Es la forma del talonario impreso: la raya donde se escribe a mano y, bajo
 * ella, qué va ahí. Puesto así, quien tiene el papel delante encuentra cada
 * dato en el mismo sitio que en la pantalla.
 */
function Campo({
  etiqueta,
  children,
  ancho = '',
}: {
  etiqueta: string;
  children: React.ReactNode;
  ancho?: string;
}) {
  return (
    <span className={`flex min-w-0 flex-col ${ancho}`}>
      <span className="border-b border-ink-2 px-1 pb-0.5 font-sans text-sm text-ink">
        {children}
      </span>
      <span className="mt-1 px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
        {etiqueta}
      </span>
    </span>
  );
}

/**
 * Los pagarés hermanos de una serie (§12).
 *
 * Un pagaré es de pago único, así que un plan de doce mensualidades son doce
 * títulos. Al abrir uno, la pregunta es cómo va el resto: cuáles se pagaron,
 * cuál vence ahora y cuánto queda del plan.
 */
function SeriePagares({
  serie,
  actual,
}: {
  serie: NonNullable<NoteDetail['series']>;
  actual: string;
}) {
  const pagados = serie.notes.filter((nota) => nota.status === 'PAID').length;
  const total = serie.notes.reduce((suma, nota) => suma + BigInt(nota.amount.cents), 0n);
  const pendiente = serie.notes.reduce((suma, nota) => suma + BigInt(nota.balance.cents), 0n);

  return (
    <section className="card p-4" aria-label="Serie de pagarés">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Pago {serie.index} de {serie.size}
        </h2>
        <p className="tnum text-xs text-muted">
          {pagados} de {serie.size} pagados
        </p>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Deuda de {money(total.toString())}, documentada en {serie.size} pagarés. Queda{' '}
        {money(pendiente.toString())}.
      </p>

      <ol className="mt-3 divide-y divide-line border-t border-line">
        {serie.notes.map((nota) => {
          const esActual = nota.id === actual;
          const fila = (
            <>
              <span className="tnum w-8 shrink-0 font-mono text-xs text-muted">{nota.index}</span>
              <span className="tnum w-24 shrink-0 text-xs text-ink-2">{shortDate(nota.dueDate)}</span>
              <span className="tnum flex-1 text-right text-sm text-ink">
                {nota.amount.formatted}
              </span>
              <span className="w-24 shrink-0 text-right">
                <StatusChip status={nota.status} />
              </span>
            </>
          );

          return (
            <li key={nota.id}>
              {esActual ? (
                // El que se está viendo no es un enlace a sí mismo: se marca.
                <div
                  aria-current="page"
                  className="flex items-center gap-2 rounded bg-accent-soft/60 px-1 py-2"
                >
                  {fila}
                </div>
              ) : (
                <Link
                  href={`/pagares/${nota.id}`}
                  className="flex items-center gap-2 rounded px-1 py-2 hover:bg-surface-2"
                >
                  {fila}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
