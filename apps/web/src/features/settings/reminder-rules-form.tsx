'use client';

import { useActionState, useState } from 'react';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import {
  previewReminderAction,
  saveReminderRulesAction,
  type ReminderRule,
  type ReminderRulesData,
  type RulesState,
} from './reminder-actions';

const TEMPLATE_LABEL: Record<string, string> = {
  'due-reminder': 'Recordatorio de vencimiento',
  'overdue-notice': 'Aviso de atraso',
  'promise-reminder': 'Recordatorio de promesa de pago',
};

/** Cómo se lee un `offsetDays` en palabras: −7 no significa nada a primera vista. */
function offsetLabel(days: number): string {
  if (days === 0) return 'el día del vencimiento';
  const magnitude = Math.abs(days);
  const noun = magnitude === 1 ? 'día' : 'días';
  return days < 0
    ? `${magnitude} ${noun} antes de vencer`
    : `${magnitude} ${noun} después de vencer`;
}

/**
 * Editor de las reglas de recordatorio (§13.1).
 *
 * Las reglas viven en tabla y no en código, así que esta pantalla es la única
 * forma de cambiar qué se avisa y cuándo. Cada fila enseña cuántos avisos ha
 * mandado: una regla que nunca disparó sobra, y una que disparó mil no se toca
 * a la ligera.
 */
export function ReminderRulesForm({ data }: { data: ReminderRulesData }) {
  const [rows, setRows] = useState<ReminderRule[]>(data.rules);
  const [state, action, pending] = useActionState<RulesState, FormData>(
    saveReminderRulesAction,
    {},
  );

  const addRow = (): void => {
    setRows((current) => [
      ...current,
      {
        id: `nueva-${current.length}`,
        offsetDays: (current.at(-1)?.offsetDays ?? 0) + 7,
        channel: 'EMAIL',
        templateId: 'overdue-notice',
        active: true,
        condition: null,
        sentCount: 0,
        updatedAt: '',
      },
    ]);
  };

  return (
    <section className="card overflow-hidden" aria-label="Reglas de recordatorio">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"
          aria-hidden
        >
          <NavIcon.collections />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Reglas de recordatorio</h2>
          <p className="text-xs text-muted">
            Qué plantilla se usa en cada tramo. Nada se manda solo: al pulsar «enviar
            recordatorio» en un pagaré, se usa la regla del tramo en que esté.
          </p>
        </div>
      </header>

      <form action={action} className="px-5 py-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">Cuándo</th>
                <th className="pb-2 pr-3 font-medium">Plantilla</th>
                <th className="pb-2 pr-3 font-medium">Saldo mínimo</th>
                <th className="pb-2 pr-3 font-medium">Activa</th>
                <th className="pb-2 font-medium">Enviados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((rule, index) => (
                <tr key={rule.id}>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      name="offsetDays"
                      defaultValue={rule.offsetDays}
                      min={-365}
                      max={365}
                      required
                      aria-label={`Días respecto al vencimiento, regla ${index + 1}`}
                      className="input tnum w-24 text-right"
                    />
                    <span className="ml-2 text-xs text-muted">{offsetLabel(rule.offsetDays)}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      name="templateId"
                      defaultValue={rule.templateId}
                      aria-label={`Plantilla de la regla ${index + 1}`}
                      className="input max-w-[15rem]"
                    >
                      {data.templates.map((template) => (
                        <option key={template} value={template}>
                          {TEMPLATE_LABEL[template] ?? template}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      name="minBalance"
                      inputMode="decimal"
                      placeholder="Sin mínimo"
                      defaultValue={
                        rule.condition?.minBalanceCents
                          ? (Number(rule.condition.minBalanceCents) / 100).toFixed(2)
                          : ''
                      }
                      aria-label={`Saldo mínimo de la regla ${index + 1}`}
                      className="input tnum w-28 text-right"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {/* El checkbox no manda nada cuando está apagado, así que va
                        con un valor oculto detrás para que las posiciones de las
                        listas del formulario sigan cuadrando. */}
                    <RuleActive defaultChecked={rule.active} index={index} />
                  </td>
                  <td className="tnum py-2 text-xs text-muted">{rule.sentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? 'Guardando…' : 'Guardar reglas'}
          </button>
          <button type="button" onClick={addRow} className="btn btn-secondary">
            Añadir tramo
          </button>
        </div>

        <div aria-live="polite" className="mt-3">
          {state.ok ? (
            <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.ok}</p>
          ) : null}
          {state.error ? (
            <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
          ) : null}
        </div>
      </form>

      <div className="border-t border-line px-5 py-4">
        <h3 className="text-sm font-medium text-ink">Ver cómo le llega</h3>
        <p className="mt-1 text-xs text-muted">
          Con datos de muestra, la misma plantilla que usa el envío real. La prueba se manda a tu
          propio correo.
        </p>
        <ul className="mt-3 space-y-2">
          {data.rules.map((rule) => (
            <RulePreview key={rule.id} rule={rule} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function RuleActive({ defaultChecked, index }: { defaultChecked: boolean; index: number }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <>
      <input type="hidden" name="active" value={checked ? 'on' : 'off'} />
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
        aria-label={`Regla ${index + 1} activa`}
        className="h-4 w-4"
      />
    </>
  );
}

function RulePreview({ rule }: { rule: ReminderRule }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RulesState, FormData>(
    previewReminderAction.bind(null, rule.id),
    {},
  );

  return (
    <li className="rounded-lg border border-line px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip bg-surface-2 font-mono text-[11px] text-ink-2">
          {rule.offsetDays > 0 ? `+${rule.offsetDays}` : rule.offsetDays} d
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {TEMPLATE_LABEL[rule.templateId] ?? rule.templateId}
        </span>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="btn btn-secondary btn-sm"
        >
          {open ? 'Ocultar' : 'Vista previa'}
        </button>

        {/* El envío de prueba sí es una acción: manda un correo de verdad. */}
        <form action={action}>
          <input type="hidden" name="sendTest" value="on" />
          <button type="submit" disabled={pending} className="btn btn-secondary btn-sm">
            {pending ? 'Enviando…' : 'Enviarme una prueba'}
          </button>
        </form>
      </div>

      <div aria-live="polite">
        {state.ok ? <p className="mt-2 text-xs text-ok">{state.ok}</p> : null}
        {state.error ? <p className="mt-2 text-xs text-crit">{state.error}</p> : null}
      </div>

      {open ? (
        // `sandbox` vacío: sin scripts, sin formularios y sin acceso al padre.
        <iframe
          title={`Vista previa del aviso de ${rule.offsetDays} días`}
          sandbox=""
          src={`/ajustes/vista-previa/${rule.id}`}
          className="mt-2 h-96 w-full rounded border border-line bg-white"
        />
      ) : null}
    </li>
  );
}
