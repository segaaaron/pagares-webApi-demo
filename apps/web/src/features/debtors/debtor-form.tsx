'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createDebtorAction, type DebtorActionState } from './actions';
import { Modal, useModal } from '@/shared/ui/modal';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { useActionToast } from '@/shared/ui/use-action-toast';
import { useBlockingActionState } from '@/shared/ui/blocking';

const INPUT = 'input';

/**
 * El teléfono se escribe solo: `+52` puesto y los dígitos agrupados.
 *
 * En México el número es de diez cifras y se lee en tres tramos —lada, y el
 * número en dos mitades—. Teclear el prefijo y los espacios es trabajo que la
 * pantalla puede hacer, y era justo donde se colaba el error de formato.
 *
 * Sólo se agrupa; lo que se manda lo limpia el contrato igual, así que un
 * número de otro país tampoco se rompe: se le quitan los espacios y ya.
 */
const LADA = '+52';

function telefonoBonito(valor: string): string {
  const digitos = valor.replace(/\D/g, '').replace(/^52/, '').slice(0, 10);
  if (digitos.length === 0) return `${LADA} `;

  const tramos = [digitos.slice(0, 3), digitos.slice(3, 6), digitos.slice(6, 10)];
  return `${LADA} ${tramos.filter(Boolean).join(' ')}`;
}

function Campo({
  id,
  label,
  hint,
  error,
  opcional = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {opcional ? <span className="ml-1 font-normal text-muted">(opcional)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-crit">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Alta de un deudor, el único sitio donde nace una ficha a mano (§19.8).
 *
 * Se piden los mismos datos que el importador de cartera y en el mismo orden:
 * quien captura a mano y quien sube un archivo escriben lo mismo, así que dos
 * listas distintas sólo servirían para que una se quedara atrás. Ya pasó.
 */
export function NewDebtorForm({ label }: { label?: string | undefined } = {}) {
  const [state, action, pending] = useBlockingActionState<DebtorActionState, FormData>(
    createDebtorAction,
    {},
  );
  const modal = useModal();
  const [telefono, setTelefono] = useState(`${LADA} `);

  useActionToast(state, 'Deudor dado de alta.');

  return (
    <>
      <button type="button" onClick={modal.show} className="btn btn-primary btn-sm">
        <NavIcon.clients />
        {label ?? 'Nuevo deudor'}
      </button>

      <Modal
        open={modal.open}
        onClose={modal.hide}
        title="Dar de alta un deudor"
        description="Quien firma y debe. El pagaré se cuelga de esta ficha, así que va antes."
      >
        <form action={action}>
          <div className="space-y-4 px-5 py-5">
            {state.created ? (
              /*
               * Se nombra a quien se acaba de crear y se ofrece el paso
               * siguiente. Cerrar y devolver a la lista obligaba a buscarlo otra
               * vez para hacer lo único que se hace después: emitirle un pagaré.
               */
              <div className="space-y-3">
                <p className="rounded-lg bg-ok-soft px-3 py-2.5 text-sm text-ok">
                  <strong>{state.created.fullName}</strong> ya está en la lista.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/pagares/nuevo" className="btn btn-primary btn-sm">
                    Emitirle un pagaré
                  </Link>
                  <Link href={`/clientes/${state.created.id}`} className="btn btn-secondary btn-sm">
                    Ver su ficha
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <Campo id="fullName" label="Nombre completo" error={state.fieldErrors?.fullName}>
                  <input
                    id="fullName"
                    name="fullName"
                    required
                    minLength={3}
                    autoComplete="off"
                    placeholder="Juana Ejemplo Ramírez"
                    className={INPUT}
                  />
                </Campo>

                <Campo
                  id="address"
                  label="Domicilio"
                  hint="Va impreso en el pagaré: es donde se le busca si hay que reclamar."
                  error={state.fieldErrors?.address}
                >
                  <input
                    id="address"
                    name="address"
                    required
                    minLength={3}
                    placeholder="Av. Madero 412, Centro"
                    className={INPUT}
                  />
                </Campo>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    id="phone"
                    label="Teléfono"
                    hint="Diez dígitos. El +52 y los espacios se ponen solos."
                    error={state.fieldErrors?.phone}
                  >
                    <input
                      id="phone"
                      name="phone"
                      required
                      inputMode="tel"
                      value={telefono}
                      onChange={(event) => setTelefono(telefonoBonito(event.target.value))}
                      // Borrar hasta el prefijo lo deja como estaba: el +52 no
                      // se quita por accidente al vaciar el campo.
                      onFocus={(event) => event.currentTarget.setSelectionRange(999, 999)}
                      placeholder="+52 443 111 2233"
                      className={`${INPUT} tnum`}
                    />
                  </Campo>

                  <Campo
                    id="email"
                    label="Correo"
                    opcional
                    hint="Con correo se le crea la cuenta y firma desde la aplicación; sin él, firmará presencialmente."
                    error={state.fieldErrors?.email}
                  >
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="juana@ejemplo.mx"
                      className={INPUT}
                    />
                  </Campo>
                </div>

                <Campo
                  id="curp"
                  label="CURP"
                  opcional
                  hint="Identifica mejor que el nombre: dos «Juan Pérez» no comparten CURP."
                  error={state.fieldErrors?.curp}
                >
                  <input
                    id="curp"
                    name="curp"
                    maxLength={18}
                    autoCapitalize="characters"
                    placeholder="SABM800101HMNRLG00"
                    className={`${INPUT} font-mono uppercase`}
                  />
                </Campo>

                <Campo
                  id="notes"
                  label="Notas"
                  opcional
                  hint="Lo que hay que saber de esta persona y no cabe en un campo."
                  error={state.fieldErrors?.notes}
                >
                  <input id="notes" name="notes" placeholder="Paga los viernes" className={INPUT} />
                </Campo>
              </>
            )}

            <div aria-live="polite">
              {state.error ? (
                <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
              ) : null}
            </div>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
            <button type="button" onClick={modal.hide} className="btn btn-secondary btn-sm">
              {state.created ? 'Cerrar' : 'Cancelar'}
            </button>
            {state.created ? null : (
              <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
                {pending ? 'Guardando…' : 'Dar de alta'}
              </button>
            )}
          </footer>
        </form>
      </Modal>
    </>
  );
}
