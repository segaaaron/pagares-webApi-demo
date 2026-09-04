'use client';

import { useActionState } from 'react';
import { saveSettingsAction, type SettingsState } from './actions';
import { useActionToast } from '@/shared/ui/use-action-toast';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

const INPUT = 'w-full input';

export interface SettingsValues {
  legalName: string;
  address: string;
  phone: string | null;
  email: string | null;
  defaultIssuePlace: string;
  defaultPaymentPlace: string;
  defaultTermDays: number;
  defaultInterestRateAnnualPct: string | null;
  defaultInterestPeriod: 'MONTHLY' | 'ANNUAL';
  interestBasis: number;
  interestWarningThresholdPct: string;
  applyPaymentToInterestFirst: boolean;
  prescriptionYears: number;
  settlementToleranceCents: string;
  bankName: string | null;
  bankAccount: string | null;
  bankClabe: string | null;
  paymentReference: string | null;
}

/**
 * Bloque de ajustes. Cabecera con icono y una línea de para qué sirve, y el
 * cuerpo debajo: el mismo patrón que las demás tarjetas con contenido.
 */
function Panel({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted">{hint}</p>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

/**
 * Un campo con su etiqueta y, si el servidor lo rechazó, el motivo debajo.
 *
 * El error va pegado al campo y no sólo en la barra de abajo: con quince campos
 * en pantalla, «no se pudieron guardar los ajustes» no dice cuál hay que tocar.
 */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-crit" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettingsAction, {});

  useActionToast(state, 'Ajustes guardados.');

  // El servidor nombra el campo que rechazó; aquí sólo se busca por su nombre.
  const err = (field: string): string | undefined => state.fieldErrors?.[field];

  return (
    <form action={action} className="space-y-5">
      <Panel
        title="Organización"
        hint="Quién emite. Aparece en el pagaré, en los correos y al pie de los documentos."
        icon={<NavIcon.settings />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="legalName" error={err('legalName')} label="Razón social">
            <input id="legalName" name="legalName" required defaultValue={values.legalName} className={INPUT} />
          </Field>
          <Field id="address" error={err('address')} label="Domicilio" hint="Aparece al pie de los documentos.">
            <input id="address" name="address" required defaultValue={values.address} className={INPUT} />
          </Field>
          <Field id="phone" error={err('phone')} label="Teléfono" hint="Va al pie del pagaré y de los documentos.">
            <input id="phone" name="phone" defaultValue={values.phone ?? ''} className={INPUT} />
          </Field>
          <Field id="email" error={err('email')} label="Correo" hint="También al pie: a dónde escribe quien tenga dudas.">
            <input id="email" name="email" type="email" defaultValue={values.email ?? ''} className={INPUT} />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Valores por defecto del pagaré"
        hint="Se rellenan solos al emitir; siempre se pueden cambiar en el formulario."
        icon={<NavIcon.notes />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="defaultIssuePlace" error={err('defaultIssuePlace')} label="Lugar de expedición">
            <input id="defaultIssuePlace" name="defaultIssuePlace" required
                   defaultValue={values.defaultIssuePlace} className={INPUT} />
          </Field>
          <Field id="defaultPaymentPlace" error={err('defaultPaymentPlace')} label="Lugar de pago">
            <input id="defaultPaymentPlace" name="defaultPaymentPlace" required
                   defaultValue={values.defaultPaymentPlace} className={INPUT} />
          </Field>
          <Field id="defaultTermDays" error={err('defaultTermDays')} label="Plazo habitual (días)">
            <input id="defaultTermDays" name="defaultTermDays" type="number" min={1} max={3650}
                   defaultValue={values.defaultTermDays} className={`${INPUT} tnum`} />
          </Field>
          <Field id="defaultInterestPeriod" error={err('defaultInterestPeriod')} label="La tasa se pacta por" hint="En México lo habitual es por mes.">
            <select
              id="defaultInterestPeriod"
              name="defaultInterestPeriod"
              defaultValue={values.defaultInterestPeriod}
              className={INPUT}
            >
              <option value="MONTHLY">Mes</option>
              <option value="ANNUAL">Año</option>
            </select>
          </Field>
          <Field
            id="defaultInterestRateAnnualPct"
            label="Tasa moratoria anual (%)"
            hint="Se guarda en anual aunque se pacte por mes. Vacío = sin intereses; cero = pactados en cero."
          >
            <input id="defaultInterestRateAnnualPct" name="defaultInterestRateAnnualPct" inputMode="decimal"
                   defaultValue={values.defaultInterestRateAnnualPct ?? ''} className={`${INPUT} tnum`} />
          </Field>
          <Field id="interestBasis" error={err('interestBasis')} label="Base de cálculo" hint="360 es lo habitual en México.">
            <select id="interestBasis" name="interestBasis" defaultValue={values.interestBasis} className={INPUT}>
              <option value={360}>360 días</option>
              <option value={365}>365 días</option>
            </select>
          </Field>
          <Field
            id="interestWarningThresholdPct"
            label="Umbral de advertencia de tasa (%)"
            hint="Por encima, el sistema avisa al emitir. No impide nada: la decisión es tuya."
          >
            <input id="interestWarningThresholdPct" name="interestWarningThresholdPct" inputMode="decimal"
                   defaultValue={values.interestWarningThresholdPct} className={`${INPUT} tnum`} />
          </Field>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" name="applyPaymentToInterestFirst"
                 defaultChecked={values.applyPaymentToInterestFirst} className="h-4 w-4" />
          Aplicar los abonos primero a intereses y luego a capital
        </label>
      </Panel>

      <Panel
        title="Plazos legales"
        hint="Cuándo avisa el sistema de que un pagaré se acerca a la prescripción."
        icon={<NavIcon.alert />}
      >
        <Field
          id="prescriptionYears"
          label="Prescripción (años desde el vencimiento)"
          hint="El sistema avisa a los 180, 90 y 30 días del plazo. No cambia el estado: hay actos que la interrumpen y esa valoración es jurídica."
        >
          <input id="prescriptionYears" name="prescriptionYears" type="number" min={1} max={20}
                 defaultValue={values.prescriptionYears} className={`${INPUT} tnum sm:w-40`} />
        </Field>

        <div className="mt-4">
          <Field
            id="settlementTolerance"
            error={err('settlementToleranceCents')}
            label="Tolerancia para dar por liquidado (pesos)"
            hint="El deudor consulta el lunes y transfiere el jueves: el interés de esos días deja unos pesos de saldo. Hasta este importe, el pagaré ofrece cerrarse condonando el remanente. Tú confirmas; nunca se cierra solo. En cero, no se ofrece nunca."
          >
            <input
              id="settlementTolerance"
              name="settlementTolerance"
              inputMode="decimal"
              defaultValue={(Number(values.settlementToleranceCents ?? '0') / 100).toFixed(2)}
              className={`${INPUT} tnum sm:w-40`}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Datos para que el cliente pague"
        hint="Aparecen en la aplicación del cliente y dentro del correo de recordatorio."
        icon={<NavIcon.check />}
      >
        {/* Sin estos datos la sección «cómo pagar» no existe para el deudor, y
            el administrador no tiene forma de enterarse: la pantalla se limita a
            no aparecer, en un teléfono que él no ve. */}
        {!values.bankClabe && !values.bankAccount ? (
          <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            Mientras esto esté vacío, tus deudores no ven a dónde transferir: ni en la aplicación
            ni en el correo de recordatorio. Tendrán que llamarte para preguntarlo.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="bankName" error={err('bankName')} label="Banco">
            <input id="bankName" name="bankName" defaultValue={values.bankName ?? ''} className={INPUT} />
          </Field>
          <Field id="bankAccount" error={err('bankAccount')} label="Cuenta">
            <input id="bankAccount" name="bankAccount" defaultValue={values.bankAccount ?? ''} className={`${INPUT} tnum`} />
          </Field>
          <Field
            id="bankClabe"
            error={err('bankClabe')}
            label="CLABE"
            hint="18 dígitos. Se comprueba el dígito verificador antes de guardar."
          >
            <input id="bankClabe" name="bankClabe" defaultValue={values.bankClabe ?? ''} className={`${INPUT} tnum`} />
          </Field>
          <Field id="paymentReference" error={err('paymentReference')} label="Referencia">
            <input id="paymentReference" name="paymentReference" defaultValue={values.paymentReference ?? ''} className={INPUT} />
          </Field>
        </div>
      </Panel>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow-card-hover)] backdrop-blur">
        <div aria-live="polite" className="min-w-0 flex-1 text-sm">
          {state.error ? <p className="truncate text-crit">{state.error}</p> : null}
          {state.ok ? <p className="truncate text-ok">{state.ok}</p> : null}
          {!state.error && !state.ok ? (
            <p className="text-xs text-muted">Los cambios sólo se aplican a los pagarés que emitas después.</p>
          ) : null}
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </div>
    </form>
  );
}
