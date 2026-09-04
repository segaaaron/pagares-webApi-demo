'use client';

import Link from 'next/link';
import {useState} from 'react';
import {
  changeCollectionStageAction,
  createSettlementAction,
  registerActivityAction,
  type ActionState,
} from '@/features/notes/lifecycle-actions';
import { DateField } from '@/shared/ui/date-field';
import { useBlockingActionState } from '@/shared/ui/blocking';

/**
 * Una fila de la etapa, con la gestión al alcance.
 *
 * El cobrador abre Cobranza para saber a quién llamar hoy. Si para registrar el
 * resultado hay que entrar al pagaré y volver, la gestión no se registra: se
 * hace la llamada y se pierde. Por eso marcar, escribir el resultado y anotar la
 * promesa ocurren aquí, sin salir de la lista.
 */
export interface FilaCobranza {
  noteId: string;
  folio: string;
  debtorName: string;
  debtorPhone: string | null;
  balance: string;
  dueDate: string;
  daysOverdue: number;
}

export function CollectionRow({ fila, hoy }: { fila: FilaCobranza; hoy: string }) {
  const [abierto, setAbierto] = useState<'gestion' | 'etapa' | 'convenio' | null>(null);
  const telefono = fila.debtorPhone?.replace(/[^\d+]/g, '') ?? '';
  /**
   * WhatsApp exige el número internacional completo. El contrato acepta de 7 a
   * 15 dígitos, así que un teléfono mexicano capturado como diez dígitos —lo
   * normal— abriría un chat inexistente. Se le antepone 52 sólo en ese caso: si
   * ya trae prefijo, no se toca.
   */
  const paraWhatsApp = telefono.startsWith('+')
    ? telefono.slice(1)
    : telefono.length === 10
      ? `52${telefono}`
      : telefono;

  return (
    <li className="border-b border-line last:border-0">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link href={`/pagares/${fila.noteId}`} className="font-medium text-ink hover:underline">
            {fila.debtorName}
          </Link>
          <p className="tnum text-xs text-muted">
            {fila.folio} · vence {fila.dueDate}
            {fila.daysOverdue > 0 ? ` · ${fila.daysOverdue} días de atraso` : ''}
          </p>
        </div>

        <span className="tnum text-sm font-semibold text-ink">{fila.balance}</span>

        {/* Los enlaces del teléfono son la parte que de verdad ahorra tiempo:
            marcar sin copiar el número a mano (§24.2). */}
        {telefono ? (
          <span className="flex gap-1">
            <a href={`tel:${telefono}`} className="btn btn-ghost btn-sm" title="Llamar">
              Llamar
            </a>
            <a
              href={`https://wa.me/${paraWhatsApp}`}
              target="_blank"
              rel="noopener"
              className="btn btn-ghost btn-sm"
              title="Abrir WhatsApp"
            >
              WhatsApp
            </a>
          </span>
        ) : (
          <span className="chip bg-surface-2 text-muted" title="Sin teléfono en el expediente">
            Sin teléfono
          </span>
        )}

        <button
          type="button"
          onClick={() => setAbierto((v) => (v === 'gestion' ? null : 'gestion'))}
          aria-expanded={abierto === 'gestion'}
          className="btn btn-secondary btn-sm"
        >
          {abierto === 'gestion' ? 'Cerrar' : 'Registrar gestión'}
        </button>

        <button
          type="button"
          onClick={() => setAbierto((v) => (v === 'etapa' ? null : 'etapa'))}
          aria-expanded={abierto === 'etapa'}
          className="btn btn-ghost btn-sm"
          title="Adelantar la etapa o congelarla para que no escale sola"
        >
          Etapa
        </button>

        <button
          type="button"
          onClick={() => setAbierto((v) => (v === 'convenio' ? null : 'convenio'))}
          aria-expanded={abierto === 'convenio'}
          className="btn btn-ghost btn-sm"
          title="Pactar monto, quita y fecha"
        >
          Convenio
        </button>
      </div>

      {abierto === 'gestion' ? <FormularioGestion noteId={fila.noteId} hoy={hoy} /> : null}
      {abierto === 'etapa' ? <FormularioEtapa noteId={fila.noteId} /> : null}
      {abierto === 'convenio' ? (
        <FormularioConvenio noteId={fila.noteId} folio={fila.folio} hoy={hoy} saldo={fila.balance} />
      ) : null}
    </li>
  );
}

const ETIQUETA = 'mb-1 block text-xs font-medium text-ink';
const CAMPO = 'input w-full text-sm';

function FormularioGestion({ noteId, hoy }: { noteId: string; hoy: string }) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    registerActivityAction.bind(null, noteId),
    {},
  );
  const [resultado, setResultado] = useState('NO_ANSWER');

  return (
    <form action={action} className="space-y-3 bg-surface-2 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`tipo-${noteId}`} className={ETIQUETA}>
            Tipo de contacto
          </label>
          <select id={`tipo-${noteId}`} name="type" className={CAMPO}>
            <option value="CALL">Llamada</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Correo</option>
            <option value="VISIT">Visita</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        <div>
          <label htmlFor={`resultado-${noteId}`} className={ETIQUETA}>
            Resultado
          </label>
          <select
            id={`resultado-${noteId}`}
            name="outcome"
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            className={CAMPO}
          >
            <option value="NO_ANSWER">No contestó</option>
            <option value="PROMISED">Prometió pagar</option>
            <option value="REFUSED">Se negó</option>
            <option value="PAID">Ya pagó</option>
            <option value="DISPUTED">Disputa el adeudo</option>
          </select>
        </div>
      </div>

      {/* La fecha sólo aparece con promesa: es lo único que la vuelve exigible. */}
      {resultado === 'PROMISED' ? (
        <div>
          <label htmlFor={`fecha-${noteId}`} className={ETIQUETA}>
            Fecha prometida
          </label>
          <DateField id={`fecha-${noteId}`} name="promisedOn" min={hoy} required />
          <p className="mt-1 text-xs text-muted">
            Si no cumple, el pagaré vuelve solo a la bandeja de hoy.
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor={`notas-${noteId}`} className={ETIQUETA}>
          Notas
        </label>
        <input id={`notas-${noteId}`} name="notes" placeholder="Qué se acordó" className={CAMPO} />
      </div>

      <div aria-live="polite" className="text-xs">
        {state.error ? <p className="text-crit">{state.error}</p> : null}
        {state.ok ? <p className="text-ok">{state.ok}</p> : null}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? 'Guardando…' : 'Guardar gestión'}
      </button>
    </form>
  );
}

/**
 * Adelantar la etapa o congelarla (§13.2).
 *
 * Congelar es lo que separa la gestión del calendario: el deudor que contesta y
 * negocia no debería llegar a judicial sólo porque pasan los días.
 */
function FormularioEtapa({ noteId }: { noteId: string }) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    changeCollectionStageAction.bind(null, noteId),
    {},
  );

  return (
    <form action={action} className="space-y-3 bg-surface-2 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`etapa-${noteId}`} className={ETIQUETA}>
            Mover a
          </label>
          <select id={`etapa-${noteId}`} name="stage" className={CAMPO} defaultValue="">
            <option value="">Dejarla como está</option>
            <option value="PREVENTIVA">Preventiva</option>
            <option value="ADMINISTRATIVA">Administrativa</option>
            <option value="EXTRAJUDICIAL">Extrajudicial</option>
            <option value="JUDICIAL">Judicial</option>
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="frozen" className="h-4 w-4 accent-[var(--color-accent)]" />
            Congelar: que no escale sola
          </label>
        </div>
      </div>

      <div>
        <label htmlFor={`motivo-${noteId}`} className={ETIQUETA}>
          Motivo
        </label>
        <input
          id={`motivo-${noteId}`}
          name="reason"
          required
          minLength={3}
          placeholder="Por qué se mueve o se congela"
          className={CAMPO}
        />
      </div>

      <div aria-live="polite" className="text-xs">
        {state.error ? <p className="text-crit">{state.error}</p> : null}
        {state.ok ? <p className="text-ok">{state.ok}</p> : null}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? 'Guardando…' : 'Guardar etapa'}
      </button>
    </form>
  );
}

/**
 * Convenio y quita, desde la lista (§13.4).
 *
 * Se negocia por teléfono y, si no se captura en ese momento, se negocia otra
 * vez el mes siguiente. Pide el folio escrito porque la quita es dinero que se
 * perdona: un clic de más no debería otorgarla.
 */
function FormularioConvenio({
  noteId,
  folio,
  hoy,
  saldo,
}: {
  noteId: string;
  folio: string;
  hoy: string;
  saldo: string;
}) {
  const [state, action, pending] = useBlockingActionState<ActionState, FormData>(
    createSettlementAction.bind(null, noteId, folio),
    {},
  );

  return (
    <form action={action} className="space-y-3 bg-surface-2 px-4 py-3">
      <p className="text-xs text-muted">
        Saldo actual {saldo}. Si el convenio se incumple en su fecha, el pagaré vuelve a vencido con
        el saldo original y sale el aviso. Nadie tiene que acordarse.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`acordado-${noteId}`} className={ETIQUETA}>
            Monto convenido
          </label>
          <input
            id={`acordado-${noteId}`}
            name="agreed"
            inputMode="decimal"
            required
            placeholder="0.00"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor={`quita-${noteId}`} className={ETIQUETA}>
            Quita otorgada
          </label>
          <input
            id={`quita-${noteId}`}
            name="forgiven"
            inputMode="decimal"
            defaultValue="0"
            className={CAMPO}
          />
        </div>
        <div>
          <label htmlFor={`vence-${noteId}`} className={ETIQUETA}>
            Vence el
          </label>
          <DateField id={`vence-${noteId}`} name="dueOn" min={hoy} required />
        </div>
      </div>

      <div>
        <label htmlFor={`terminos-${noteId}`} className={ETIQUETA}>
          Términos
        </label>
        <input
          id={`terminos-${noteId}`}
          name="terms"
          placeholder="Parcialidades, forma de pago, lo que se acordó"
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor={`confirmar-${noteId}`} className={ETIQUETA}>
          Escribe {folio} para confirmar
        </label>
        <input id={`confirmar-${noteId}`} name="confirm" required className={CAMPO} />
      </div>

      <div aria-live="polite" className="text-xs">
        {state.error ? <p className="text-crit">{state.error}</p> : null}
        {state.ok ? <p className="text-ok">{state.ok}</p> : null}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? 'Registrando…' : 'Registrar convenio'}
      </button>
    </form>
  );
}
