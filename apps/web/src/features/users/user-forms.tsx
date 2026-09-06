'use client';

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

/**
 * Dar acceso a la aplicación a un deudor.
 *
 * **La ficha es obligatoria.** Un acceso existe para que alguien consulte sus
 * pagarés, así que una cuenta sin deudor no puede consultar nada: entra, no ve
 * nada, y no aparece en el buscador de la emisión porque ése consulta fichas y
 * no cuentas. Era una puerta que no llevaba a ningún sitio.
 *
 * Quien todavía no está en la cartera se da de alta como deudor —o nace con su
 * primer pagaré, que ya le abre la cuenta solo (§25.2)—.
 */
export function CreateUserForm({
  debtor,
  label,
}: {
  debtor: { id: string; fullName: string; phone: string; email: string | null };
  label?: string | undefined;
}) {
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
        title={`Dar acceso a ${debtor.fullName}`}
        description="Se genera una contraseña temporal, se le envía por correo y se muestra aquí una vez."
      >
        <form action={action}>
          <div className="space-y-4 px-5 py-5">
            <input type="hidden" name="debtorId" value={debtor.id} />

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
                defaultValue={debtor.fullName}
                readOnly
                className="input bg-surface-2 text-muted"
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                Correo
              </label>
              {/*
                * Lo único que se escribe. El nombre y el teléfono los pone la
                * ficha: poder teclearlos era la forma más fácil de darle acceso
                * a la persona equivocada. El correo sí cambia —se le acaba una
                * cuenta, pone la del trabajo—, y el que se use aquí se guarda
                * también en la ficha para que no queden dos.
                */}
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="correo@ejemplo.mx"
                defaultValue={debtor.email ?? ''}
                className="input"
              />
              <p className="mt-1 text-xs text-muted">
                Ahí llegan su contraseña temporal y los avisos. Se guarda también en su ficha.
              </p>
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink">
                Teléfono
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={debtor.phone}
                readOnly
                className="input bg-surface-2 text-muted"
              />
              <p className="mt-1 text-xs text-muted">El de su ficha, para que la cuenta sea suya y de nadie más.</p>
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
              {pending ? 'Creando…' : 'Dar acceso'}
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
