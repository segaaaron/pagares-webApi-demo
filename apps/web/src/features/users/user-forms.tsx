'use client';

import Link from 'next/link';
import {useState} from 'react';
import {
  createUserAction,
  deleteUserAccessAction,
  manageUserAction,
  type UserActionState,
} from './actions';
import { dateTime } from '@/shared/lib/format';
import { useActionToast } from '@/shared/ui/use-action-toast';
import { Modal, useModal } from '@/shared/ui/modal';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { useBlockingActionState } from '@/shared/ui/blocking';

/**
 * La contraseña temporal se muestra **una sola vez** (§8.3). Se dice
 * explícitamente para que el administrador la copie ahora y no la busque después.
 */
function CredentialNotice({ credential }: { credential: NonNullable<UserActionState['credential']> }) {
  return (
    <div className="rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm">
      <p className="font-medium text-accent-ink">Contraseña temporal generada</p>
      {credential.email ? <p className="text-xs text-ink-2">{credential.email}</p> : null}
      <p className="my-1 font-mono text-lg tracking-wide text-ink">{credential.password}</p>
      <p className="text-xs text-ink-2">
        No vuelve a mostrarse. Caduca el {credential.expiresAt ? dateTime(credential.expiresAt) : '—'} y
        el usuario deberá cambiarla al entrar. También le llegó por correo.
      </p>
    </div>
  );
}

export function CreateUserForm({
  debtor,
  label,
}: {
  /**
   * Cuando el alta sale de la ficha de un deudor: la cuenta se enlaza con esa
   * persona y sus pagarés vuelven a ser suyos. Sin esto, el alta crea a alguien
   * nuevo, que es lo correcto desde la lista de accesos.
   */
  debtor?: { id: string; fullName: string; phone: string; email: string | null } | undefined;
  label?: string | undefined;
} = {}) {
  const [state, action, pending] = useBlockingActionState<UserActionState, FormData>(createUserAction, {});
  const modal = useModal();

  useActionToast(state, 'Cuenta creada. La contraseña temporal está en pantalla.');

  /*
   * El alta vive en un diálogo y no en la página: es una acción puntual, y
   * tenerla siempre desplegada empujaba la lista —que es lo que se consulta a
   * diario— media pantalla hacia abajo.
   *
   * El diálogo NO se cierra solo al terminar: la contraseña temporal se enseña
   * una única vez (§8.3) y cerrarlo sería la forma más rápida de perderla.
   */
  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={modal.show} className="btn btn-primary">
          <NavIcon.users />
          {label ?? 'Nueva cuenta'}
        </button>
      </div>

      <Modal
        open={modal.open}
        onClose={modal.hide}
        title={debtor ? `Dar acceso a ${debtor.fullName}` : 'Dar de alta un cliente'}
        description="Se genera una contraseña temporal, se le envía por correo y se muestra aquí una vez."
      >
        <form action={action}>
          <div className="space-y-4 px-5 py-5">
            {debtor ? (
              <input type="hidden" name="debtorId" value={debtor.id} />
            ) : (
              /*
               * Desde la lista, el alta es para gente nueva. A quien ya está en
               * la cartera se le da acceso desde su ficha: la cuenta se enlaza
               * con la persona, y creada aquí quedaría suelta y sus pagarés sin
               * dueño.
               */
              <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted">
                ¿Es alguien que ya tiene pagarés?{' '}
                <Link href="/clientes?acceso=sin" className="font-medium text-accent-ink hover:underline">
                  Dale acceso desde su ficha
                </Link>{' '}
                para que sus pagarés sigan siendo suyos.
              </p>
            )}

            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-ink">
                Nombre completo
              </label>
              <input
                id="fullName"
                name="fullName"
                required
                minLength={3}
                autoComplete="off"
                defaultValue={debtor?.fullName ?? ''}
                readOnly={Boolean(debtor)}
                className={`input ${debtor ? 'bg-surface-2 text-muted' : ''}`}
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                Correo
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="correo@ejemplo.mx"
                defaultValue={debtor?.email ?? ''}
                className="input"
              />
              <p className="mt-1 text-xs text-muted">
                {debtor
                  ? 'Puede ser distinto del que tenía antes: sus pagarés van con la persona, no con el correo.'
                  : 'Ahí llegan la contraseña temporal y los avisos de sus pagarés.'}
              </p>
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink">
                Teléfono <span className="font-normal text-muted">(opcional)</span>
              </label>
              <input
                id="phone"
                name="phone"
                placeholder="+524431234567"
                defaultValue={debtor?.phone ?? ''}
                className="input"
              />
            </div>

            <div aria-live="polite" className="space-y-2">
              {state.error ? (
                <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
              ) : null}
              {state.credential ? <CredentialNotice credential={state.credential} /> : null}
            </div>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
            <button type="button" onClick={modal.hide} className="btn btn-secondary btn-sm">
              {state.credential ? 'Cerrar' : 'Cancelar'}
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
              {pending ? 'Creando…' : debtor ? 'Dar acceso' : 'Crear cuenta'}
            </button>
          </footer>
        </form>
      </Modal>
    </>
  );
}

export function UserActions({
  userId,
  status,
  locked,
  fullName,
  notesCount,
}: {
  userId: string;
  status: string;
  locked: boolean;
  fullName: string;
  notesCount: number;
}) {
  const [state, action, pending] = useBlockingActionState<UserActionState, FormData>(
    async (prev, formData) => {
      const orden = String(formData.get('action'));
      if (orden === 'delete') return deleteUserAccessAction(userId, prev);
      return manageUserAction(
        userId,
        orden as 'reset-password' | 'unlock' | 'suspend' | 'activate',
        prev,
      );
    },
    {},
  );
  // Borrar el acceso no se deshace: se confirma con lo que se lleva por delante
  // a la vista, no con un «¿estás seguro?» que nadie lee.
  const [confirmando, setConfirmando] = useState(false);

  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap justify-end gap-1.5">
        <button name="action" value="reset-password" disabled={pending} className="btn btn-secondary btn-sm">
          Restablecer
        </button>
        {locked ? (
          <button
            name="action"
            value="unlock"
            disabled={pending}
            className="btn btn-secondary btn-sm border-warn text-warn hover:bg-warn-soft"
          >
            Desbloquear
          </button>
        ) : null}
        {status === 'SUSPENDED' ? (
          <button name="action" value="activate" disabled={pending} className="btn btn-secondary btn-sm">
            Reactivar
          </button>
        ) : (
          <button
            name="action"
            value="suspend"
            disabled={pending}
            className="btn btn-secondary btn-sm border-crit text-crit hover:bg-crit-soft"
          >
            Suspender
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmando((v) => !v)}
          disabled={pending}
          className="btn btn-ghost btn-sm text-crit hover:bg-crit-soft"
          title="Elimina la cuenta; el deudor y sus pagarés se quedan"
        >
          Eliminar acceso
        </button>
      </div>

      {confirmando ? (
        <div className="rounded-lg border border-crit bg-crit-soft px-3 py-2.5 text-left">
          <p className="text-xs text-ink">
            Se elimina la cuenta de <strong>{fullName}</strong> y su correo queda libre.
            {notesCount > 0
              ? ` Sus ${notesCount} ${notesCount === 1 ? 'pagaré sigue' : 'pagarés siguen'} en la cartera, con su saldo y su historial.`
              : ' No tiene pagarés a su nombre.'}{' '}
            Podrás volver a darle acceso desde la ficha del deudor.
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancelar
            </button>
            <button
              name="action"
              value="delete"
              disabled={pending}
              className="btn btn-sm border-crit bg-crit text-white hover:opacity-90"
            >
              {pending ? 'Eliminando…' : 'Eliminar acceso'}
            </button>
          </div>
        </div>
      ) : null}

      <div aria-live="polite">
        {state.error ? <p className="text-xs text-crit">{state.error}</p> : null}
        {state.ok ? <p className="text-xs text-ok">{state.ok}</p> : null}
        {state.credential ? <CredentialNotice credential={state.credential} /> : null}
      </div>
    </form>
  );
}
