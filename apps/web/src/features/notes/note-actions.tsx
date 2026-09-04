'use client';

import {useState} from 'react';
import {
  createSettlementAction,
  extendNoteAction,
  registerActivityAction,
  renewNoteAction,
  sendReminderAction,
  voidNoteAction,
  writeOffNoteAction,
  type ActionState,
} from './lifecycle-actions';
import { VOID_REASONS, WRITE_OFF_REASONS } from './reason-catalogs';
import { DateField } from '@/shared/ui/date-field';
import { useBlockingActionState } from '@/shared/ui/blocking';

const INPUT = 'w-full input';
const LABEL = 'mb-1 block text-xs text-muted';

function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error ? (
        <p className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
      ) : null}
      {state.ok ? <p className="rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">{state.ok}</p> : null}
    </div>
  );
}

/**
 * Panel de acciones del pagaré (§19.5).
 *
 * Las que el estado no permite **no se ocultan**: se deshabilitan con el motivo
 * a la vista, para que la regla se aprenda en vez de parecer un fallo.
 */
export function NoteActions({
  noteId,
  folio,
  status,
  balanceLabel,
  today,
  hasEmail,
}: {
  noteId: string;
  folio: string;
  status: string;
  balanceLabel: string;
  today: string;
  /** Sin correo el recordatorio se manda a mano, así que el botón se deshabilita. */
  hasEmail: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const isFinal = ['PAID', 'VOID', 'RENEWED'].includes(status);
  const unsigned = ['PENDING_SIGNATURE', 'PROCESSING_SIGNATURE'].includes(status);

  const reasons: Record<string, string | undefined> = {
    extend: isFinal ? 'el pagaré está en un estado final' : unsigned ? 'todavía no está firmado' : undefined,
    renew: isFinal ? 'el pagaré está en un estado final' : unsigned ? 'todavía no está firmado' : undefined,
    settlement:
      status === 'RESTRUCTURED'
        ? 'ya tiene un convenio vigente'
        : isFinal
          ? 'el pagaré está en un estado final'
          : unsigned
            ? 'todavía no está firmado'
            : undefined,
    'write-off': isFinal ? 'el pagaré está en un estado final' : unsigned ? 'todavía no está firmado' : undefined,
    void: isFinal ? 'el pagaré ya está cerrado' : undefined,
    activity: undefined,
    // Sin correo el recordatorio es manual, y un pagaré liquidado no se cobra.
    reminder: isFinal ? 'el pagaré ya está cerrado' : hasEmail ? undefined : 'el deudor no tiene correo',
  };

  const buttons: { id: string; label: string; danger?: boolean }[] = [
    { id: 'reminder', label: 'Enviar recordatorio' },
    { id: 'activity', label: 'Registrar gestión' },
    { id: 'extend', label: 'Prorrogar' },
    { id: 'settlement', label: 'Convenio' },
    { id: 'renew', label: 'Renovar' },
    { id: 'write-off', label: 'Dar de baja', danger: true },
    { id: 'void', label: 'Anular', danger: true },
  ];

  return (
    <section className="card p-4" aria-label="Acciones">
      <h2 className="mb-3 text-sm font-semibold">Acciones</h2>

      <div className="flex flex-wrap gap-1.5">
        {buttons.map((b) => {
          const blocked = reasons[b.id];
          return (
            <button
              key={b.id}
              type="button"
              disabled={Boolean(blocked)}
              title={blocked ? `No disponible: ${blocked}` : undefined}
              onClick={() => setOpen(open === b.id ? null : b.id)}
              className={`rounded border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                b.danger
                  ? 'border-crit text-crit hover:bg-crit-soft'
                  : 'border-line-strong hover:bg-surface-2'
              } ${open === b.id ? 'bg-surface-2' : ''}`}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      {open === 'reminder' ? <ReminderPanel noteId={noteId} /> : null}
      {open === 'activity' ? <ActivityForm noteId={noteId} today={today} /> : null}
      {open === 'extend' ? <ExtendForm noteId={noteId} today={today} /> : null}
      {open === 'settlement' ? (
        <SettlementForm noteId={noteId} folio={folio} today={today} balanceLabel={balanceLabel} />
      ) : null}
      {open === 'renew' ? <RenewForm noteId={noteId} today={today} /> : null}
      {open === 'write-off' ? <ReasonForm noteId={noteId} folio={folio} kind="write-off" /> : null}
      {open === 'void' ? <ReasonForm noteId={noteId} folio={folio} kind="void" /> : null}
    </section>
  );
}

/** Confirma antes de enviar: un correo no se puede "des-enviar". */
function ReminderPanel({ noteId }: { noteId: string }) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    sendReminderAction.bind(null, noteId),
    {},
  );

  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <p className="text-xs text-muted">
        Se le envía por correo el recordatorio con el saldo, la fecha de vencimiento y los datos
        para pagar que tengas en Ajustes. Queda registrado en la bitácora.
      </p>
      <div aria-live="polite" className="text-xs">
        {state.error ? <p className="text-crit">{state.error}</p> : null}
        {state.ok ? <p className="text-ok">{state.ok}</p> : null}
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? 'Enviando…' : 'Enviar recordatorio'}
      </button>
    </form>
  );
}

function ActivityForm({ noteId, today }: { noteId: string; today: string }) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    registerActivityAction.bind(null, noteId),
    {},
  );
  const [outcome, setOutcome] = useState('NO_ANSWER');

  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="type" className={LABEL}>Tipo de contacto</label>
          <select id="type" name="type" className={INPUT}>
            <option value="CALL">Llamada</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Correo</option>
            <option value="VISIT">Visita</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        <div>
          <label htmlFor="outcome" className={LABEL}>Resultado</label>
          <select id="outcome" name="outcome" className={INPUT} value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}>
            <option value="NO_ANSWER">No contestó</option>
            <option value="PROMISED">Prometió pagar</option>
            <option value="REFUSED">Se negó</option>
            <option value="PAID">Ya pagó</option>
            <option value="DISPUTED">Disputa el adeudo</option>
          </select>
        </div>
      </div>

      {/* La fecha sólo aparece cuando hay promesa: es lo único que la hace útil. */}
      {outcome === 'PROMISED' ? (
        <div>
          <label htmlFor="promisedOn" className={LABEL}>Fecha prometida</label>
          <DateField id="promisedOn" name="promisedOn" min={today} required />
          <p className="mt-1 text-xs text-muted">
            Si no cumple, el pagaré vuelve solo a la bandeja de Hoy.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="notes" className={LABEL}>Notas</label>
        <input id="notes" name="notes" placeholder="Qué se acordó" className={INPUT} />
      </div>

      <Feedback state={state} />
      <button type="submit" disabled={pending}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60">
        {pending ? 'Guardando…' : 'Guardar gestión'}
      </button>
    </form>
  );
}

function ExtendForm({ noteId, today }: { noteId: string; today: string }) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    extendNoteAction.bind(null, noteId),
    {},
  );
  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <p className="text-xs text-muted">
        El pagaré conserva su firma: es el mismo documento con vencimiento nuevo.
      </p>
      <div>
        <label htmlFor="newDueDate" className={LABEL}>Nuevo vencimiento</label>
        <DateField id="newDueDate" name="newDueDate" min={today} required />
      </div>
      <div>
        <label htmlFor="reason" className={LABEL}>Motivo</label>
        <input id="reason" name="reason" required minLength={3} className={INPUT} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60">
        {pending ? 'Registrando…' : 'Registrar prórroga'}
      </button>
    </form>
  );
}

function RenewForm({ noteId, today }: { noteId: string; today: string }) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    renewNoteAction.bind(null, noteId),
    {},
  );
  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <p className="text-xs text-muted">
        Se emite un documento nuevo por el saldo pendiente y este queda cerrado.
        El cliente deberá firmarlo.
      </p>
      <div>
        <label htmlFor="renewDue" className={LABEL}>Vencimiento del nuevo pagaré</label>
        <DateField id="renewDue" name="newDueDate" min={today} required />
      </div>
      <div>
        <label htmlFor="renewReason" className={LABEL}>Motivo</label>
        <input id="renewReason" name="reason" required minLength={3} className={INPUT} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60">
        {pending ? 'Renovando…' : 'Renovar pagaré'}
      </button>
    </form>
  );
}

function SettlementForm({
  noteId,
  folio,
  today,
  balanceLabel,
}: {
  noteId: string;
  folio: string;
  today: string;
  balanceLabel: string;
}) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    createSettlementAction.bind(null, noteId, folio),
    {},
  );
  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <p className="text-xs text-muted">
        Lo convenido más la quita debe cubrir el saldo de {balanceLabel}. Si el convenio se
        incumple, el saldo original se restablece solo.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="agreed" className={LABEL}>Monto convenido</label>
          <input id="agreed" name="agreed" inputMode="decimal" required className={`${INPUT} tnum text-right`} />
        </div>
        <div>
          <label htmlFor="forgiven" className={LABEL}>Quita (perdonado)</label>
          <input id="forgiven" name="forgiven" inputMode="decimal" defaultValue="0"
                 className={`${INPUT} tnum text-right`} />
        </div>
      </div>
      <div>
        <label htmlFor="dueOn" className={LABEL}>Fecha límite del convenio</label>
        <DateField id="dueOn" name="dueOn" min={today} required />
      </div>
      <div>
        <label htmlFor="terms" className={LABEL}>Condiciones</label>
        <input id="terms" name="terms" placeholder="Opcional" className={INPUT} />
      </div>
      {/* La quita perdona deuda y no se revierte: se confirma escribiendo el
          folio, igual que el castigo (§24.5). */}
      <div>
        <label htmlFor="settlement-confirm" className={LABEL}>
          Escribe <span className="font-mono">{folio}</span> para confirmar
        </label>
        <input id="settlement-confirm" name="confirm" required className={`${INPUT} font-mono`} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60">
        {pending ? 'Registrando…' : 'Registrar convenio'}
      </button>
    </form>
  );
}

/**
 * Anular y castigar: además del motivo de catálogo, hay que **teclear el folio**.
 * Son irreversibles en lo económico y un clic accidental no debe bastar (§24.5).
 */
function ReasonForm({ noteId, folio, kind }: { noteId: string; folio: string; kind: 'void' | 'write-off' }) {
  const bound = kind === 'void' ? voidNoteAction : writeOffNoteAction;
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    bound.bind(null, noteId, folio),
    {},
  );
  const reasons = kind === 'void' ? VOID_REASONS : WRITE_OFF_REASONS;

  return (
    <form action={action} className="mt-3 space-y-3 border-t border-line pt-3">
      <p className="rounded-md bg-crit-soft px-3 py-2 text-xs text-crit">
        {kind === 'void'
          ? 'El pagaré deja de computar en la cartera. Queda registrado, no se borra.'
          : 'Dar de baja no es perdonar: sale de la cartera activa, pero la deuda sigue siendo exigible y admite abonos como recuperación.'}
      </p>
      <div>
        <label htmlFor={`${kind}-reason`} className={LABEL}>Motivo</label>
        <select id={`${kind}-reason`} name="reasonCode" className={INPUT}>
          {reasons.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${kind}-note`} className={LABEL}>Detalle</label>
        <input id={`${kind}-note`} name="reasonNote" required minLength={3} className={INPUT} />
      </div>
      <div>
        <label htmlFor={`${kind}-confirm`} className={LABEL}>
          Escribe <span className="font-mono">{folio}</span> para confirmar
        </label>
        <input id={`${kind}-confirm`} name="confirm" required className={`${INPUT} font-mono`} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending}
              className="rounded-md border border-crit bg-surface px-3 py-2 text-sm font-semibold text-crit hover:bg-crit-soft disabled:opacity-60">
        {pending ? 'Procesando…' : kind === 'void' ? 'Anular pagaré' : 'Dar de baja el pagaré'}
      </button>
    </form>
  );
}
