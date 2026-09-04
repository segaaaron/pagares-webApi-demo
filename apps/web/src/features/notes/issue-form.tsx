'use client';

import {useState} from 'react';
import { issueNoteAction, type IssueState } from './issue-actions';
import { DateField } from '@/shared/ui/date-field';
import { DebtorPicker, type DebtorHit } from './debtor-picker';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { toAnnualRatePct } from '@pagares/domain-rules';
import { money } from '@/shared/lib/format';
import { useBlockingActionState } from '@/shared/ui/blocking';

/**
 * Datos con los que llega el formulario cuando se duplica un pagaré (§19.6).
 *
 * Emitir tres pagarés al mismo deudor obligaba a teclear tres veces los mismos
 * ocho campos, y ahí es donde se cuela el error de importe.
 */
export interface Plantilla {
  debtor?: DebtorHit | undefined;
  amount?: string | undefined;
  observations?: string | undefined;
  /**
   * Los avales del pagaré anterior de esa persona.
   *
   * Quien avala suele volver a avalar —es el padre, el socio, la esposa—, así
   * que vienen escritos y se cambian si el aval es otro. Teclearlos de nuevo en
   * cada emisión es trabajo que el sistema ya tenía hecho.
   */
  guarantors?: { position: number; fullName: string; address: string; phone: string }[] | undefined;
}

interface Defaults {
  creditorName: string;
  interestPeriod: 'MONTHLY' | 'ANNUAL';
  interestWarningThresholdPct: number;
  issuePlace: string;
  paymentPlace: string;
  interestRate: string;
  today: string;
  defaultDueDate: string;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  // `undefined` explícito: los errores llegan de un objeto donde la clave puede faltar.
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-crit">{error}</p> : null}
    </div>
  );
}

const INPUT = 'w-full input';

/** Bloque del formulario: icono, título y para qué sirve. */
function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    // Sin `overflow-hidden`: recortaba el calendario de las fechas contra el
    // borde de la tarjeta, y con él media hoja del mes. La cabecera redondea sus
    // propias esquinas, que era lo único que aquel recorte resolvía.
    <section className="card">
      <header className="flex items-center gap-3 rounded-t-xl border-b border-line px-5 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/** Los valores por defecto vienen de Ajustes: no se teclean en cada pagaré (§19.6). */
export function IssueForm({
  defaults,
  plantilla,
}: {
  defaults: Defaults;
  plantilla?: Plantilla | undefined;
}) {
  const [state, action, pending] = useBlockingActionState<IssueState, FormData>(issueNoteAction, {});

  // Aviso de tasa (§25.14): avisa, no impide. La decisión es del administrador,
  // pero un 10% mensual son 120% anual y conviene verlo antes de firmar.
  /**
   * Avales sugeridos: los del pagaré anterior de quien se acaba de elegir.
   *
   * Se piden al elegir, no antes: el buscador devuelve lo justo para reconocer
   * a la persona, y esto sólo importa cuando ya se decidió quién firma.
   */
  const [avales, setAvales] = useState(plantilla?.guarantors ?? []);
  const [rate, setRate] = useState(defaults.interestRate);
  const [period, setPeriod] = useState<'MONTHLY' | 'ANNUAL'>(defaults.interestPeriod);
  const [pagos, setPagos] = useState(1);
  const [importe, setImporte] = useState(plantilla?.amount ?? '');
  /**
   * Cuánto sale cada pagaré, para enseñarlo antes de emitir.
   *
   * El reparto de verdad lo hace el servidor —es dinero y su regla vive en
   * `domain-rules`—; esto es sólo la vista previa, y por eso redondea hacia
   * abajo y no promete el centavo suelto, que va en el primero.
   */
  const cuota = (() => {
    const centavos = Math.round(Number(importe.replace(/[^\d.]/g, '')) * 100);
    if (!Number.isFinite(centavos) || centavos <= 0 || pagos < 2) return null;
    const base = Math.floor(centavos / pagos);
    if (base <= 0) return null;
    return money(String(base));
  })();

  const annual = rate === '' ? null : toAnnualRatePct(Number(rate), period);
  const aboveThreshold = annual !== null && annual > defaults.interestWarningThresholdPct;

  return (
    <form action={action} className="space-y-6">
      <Section
        icon={<NavIcon.notes />}
        title="Datos del pagaré"
        hint="Importe, plazo y las menciones que exige el art. 170 de la Ley de Títulos: lugar y fecha de expedición y de pago."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="amount" label="Importe (pesos)" error={state.fieldErrors?.amountCents ?? state.fieldErrors?.amount}>
            <input id="amount" name="amount" inputMode="decimal" required placeholder="0.00"
                   value={importe}
                   onChange={(event) => setImporte(event.target.value)}
                   className={`${INPUT} tnum text-right`} />
          </Field>
          <div>
            <label htmlFor="interestRate" className="mb-1 block text-xs font-medium text-ink-2">
              Interés moratorio
            </label>
            <div className="flex">
              <input
                id="interestRate"
                name="interestRate"
                inputMode="decimal"
                placeholder="0.00"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
                className={`${INPUT} tnum rounded-r-none text-right`}
              />
              {/* En México se pacta casi siempre por mes ("3% mensual"); la
                  anual también se usa. El documento dirá lo que elijas aquí y
                  el sistema calcula con su equivalente anual simple (§12.3). */}
              <select
                name="interestPeriod"
                aria-label="Periodicidad del interés moratorio"
                value={period}
                onChange={(event) => setPeriod(event.target.value === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY')}
                className="input w-32 rounded-l-none border-l-0"
              >
                <option value="MONTHLY">% mensual</option>
                <option value="ANNUAL">% anual</option>
              </select>
            </div>
            {aboveThreshold ? (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-warn-soft px-2.5 py-2 text-xs text-warn">
                <span aria-hidden className="mt-0.5 shrink-0">
                  <NavIcon.alert />
                </span>
                <span>
                  Equivale a <span className="tnum font-semibold">{Number(annual?.toFixed(2))}% anual</span>, por
                  encima del umbral de {defaults.interestWarningThresholdPct}% que fijaste en Ajustes. Un
                  juez puede reducir de oficio un interés notoriamente usurario. Puedes continuar; es
                  tu decisión.
                </span>
              </p>
            ) : null}
            {state.fieldErrors?.['interestRate.value'] ? (
              <p className="mt-1 text-xs text-crit">{state.fieldErrors['interestRate.value']}</p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Vacío = sin intereses pactados; entonces aplica el legal, 6% anual (art. 362
                Cód. Comercio). Cero = pactados en cero.
              </p>
            )}
          </div>

          <Field id="issueDate" label="Fecha de expedición" error={state.fieldErrors?.issueDate}>
            <DateField id="issueDate" name="issueDate" required
                       defaultValue={defaults.today} max={defaults.today} />
          </Field>
          <Field id="dueDate" label="Fecha de vencimiento" error={state.fieldErrors?.dueDate}>
            <DateField id="dueDate" name="dueDate" required
                       defaultValue={defaults.defaultDueDate} min={defaults.today} />
          </Field>
          {/*
            * Pagos: un pagaré es de pago único, así que doce mensualidades son
            * doce pagarés firmados hoy con vencimientos mes a mes. Se dice en
            * la ayuda porque quien lo elige tiene que saber qué va a firmar.
            */}
          <Field id="installments" label="Número de pagos" error={state.fieldErrors?.installments}>
            <select
              id="installments"
              name="installments"
              className={INPUT}
              value={pagos}
              onChange={(event) => setPagos(Number(event.target.value))}
            >
              <option value={1}>Un solo pago</option>
              {[2, 3, 4, 6, 9, 12, 18, 24].map((n) => (
                <option key={n} value={n}>
                  {n} pagos mensuales
                </option>
              ))}
            </select>
          </Field>
          {/*
            * Lo que se va a firmar, dicho antes de firmarlo: cuántos documentos
            * son y de cuánto sale cada uno. Elegir «12 pagos» sin ver que eso
            * son doce pagarés de $5,000 es el malentendido caro de esta
            * pantalla.
            */}
          {pagos > 1 ? (
            <p className="sm:col-span-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs text-accent-ink">
              Se emitirán <strong>{pagos} pagarés</strong> firmados hoy, con vencimientos mes a mes
              desde la fecha de arriba
              {cuota ? (
                <>
                  , de <strong>{cuota}</strong> cada uno
                </>
              ) : null}
              . Cada uno se cobra y se reclama por separado.
            </p>
          ) : null}
          <Field id="issuePlace" label="Lugar de expedición" error={state.fieldErrors?.issuePlace}>
            <input id="issuePlace" name="issuePlace" required defaultValue={defaults.issuePlace} className={INPUT} />
          </Field>
          <Field id="paymentPlace" label="Lugar de pago" error={state.fieldErrors?.paymentPlace}>
            <input id="paymentPlace" name="paymentPlace" required defaultValue={defaults.paymentPlace} className={INPUT} />
          </Field>
          <Field id="creditorName" label="A favor de" error={state.fieldErrors?.creditorName}>
            <input id="creditorName" name="creditorName" required defaultValue={defaults.creditorName} className={INPUT} />
          </Field>
          <Field id="observations" label="Observaciones">
            <input id="observations" name="observations" placeholder="Opcional" className={INPUT} />
          </Field>
        </div>
      </Section>

      <Section
        icon={<NavIcon.clients />}
        title="Suscriptor"
        hint="Quien firma y debe. Con correo se le crea la cuenta y firma desde la aplicación; sin correo, firmará presencialmente."
      >
        <DebtorPicker
          inputClassName={INPUT}
          errors={state.fieldErrors ?? {}}
          preselected={plantilla?.debtor}
          onChoose={(hit) => {
            if (!hit) {
              setAvales([]);
              return;
            }
            fetch(`/pagares/nuevo/deudores/${hit.id}`, {
              // Sin plazo, un servidor que no contesta deja los avales del
              // formulario en el limbo, ni puestos ni descartados.
              signal: AbortSignal.timeout(10_000),
            })
              .then((r) => r.json())
              .then((d: { guarantors?: typeof avales }) => setAvales(d.guarantors ?? []))
              // Sin avales previos se emite igual: el formulario no depende de esto.
              .catch(() => setAvales([]));
          }}
        />
      </Section>

      {/* Avales: cero, uno o dos, como el formulario impreso (§25.15). Si el
          pagaré declara avales, no queda emitido hasta que todos firmen. */}
      <Section
        icon={<NavIcon.users />}
        title="Avales"
        hint="Opcionales, hasta dos. El aval responde igual que el suscriptor y firma su propio bloque: el pagaré no queda emitido hasta que firman todos."
      >
        {avales.length ? (
          <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            Vienen del pagaré anterior de esta persona. Cámbialos si el aval es otro, o bórralos si
            este pagaré va sin aval.
          </p>
        ) : null}
        <div className="space-y-5">
          {[1, 2].map((position) => {
            const previo = avales.find((g) => g.position === position);
            return (
              <div key={`${position}-${previo?.fullName ?? ''}`} className="grid gap-4 sm:grid-cols-3">
                <Field id={`guarantor${position}Name`} label={`Aval ${position} · nombre completo`}>
                  <input
                    id={`guarantor${position}Name`}
                    name={`guarantor${position}Name`}
                    defaultValue={previo?.fullName ?? ''}
                    className={INPUT}
                  />
                </Field>
                <Field id={`guarantor${position}Address`} label="Domicilio">
                  <input
                    id={`guarantor${position}Address`}
                    name={`guarantor${position}Address`}
                    defaultValue={previo?.address ?? ''}
                    className={INPUT}
                  />
                </Field>
                <Field id={`guarantor${position}Phone`} label="Teléfono">
                  <input
                    id={`guarantor${position}Phone`}
                    name={`guarantor${position}Phone`}
                    placeholder="+524431234567"
                    defaultValue={previo?.phone ?? ''}
                    className={INPUT}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </Section>

      <div aria-live="polite">
        {state.error ? (
          <p className="rounded-md bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <button type="submit" disabled={pending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60">
          {pending ? 'Creando…' : 'Crear pagaré'}
        </button>
      </div>
    </form>
  );
}
