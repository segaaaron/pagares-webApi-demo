'use client';

import { useActionState, useState } from 'react';
import { createUserAction, type UserActionState } from '@/features/users/actions';

/**
 * Dar acceso a la aplicación desde la ficha del deudor (§25.2).
 *
 * El enlace se hace contra **la persona**, no contra un correo: así, cuando a
 * alguien se le quitó el acceso y meses después vuelve con otra dirección, sus
 * pagarés siguen siendo suyos. Enlazar por correo sería confiar en un dato que
 * cambia, se comparte en familia y puede acabar en manos de otro.
 */
export function GrantAccess({
  debtorId,
  fullName,
  email,
  phone,
}: {
  debtorId: string;
  fullName: string;
  email: string | null;
  phone: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [state, action, pending] = useActionState<UserActionState, FormData>(createUserAction, {});

  if (state.credential) {
    return (
      <div className="card space-y-2 border-ok p-4">
        <p className="text-sm font-medium text-ink">Acceso creado para {fullName}</p>
        <p className="text-xs text-muted">
          La contraseña temporal se muestra una sola vez y también se envía por correo. Al entrar en
          la aplicación tendrá que cambiarla.
        </p>
        <p className="select-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm text-ink">
          {state.credential.password}
        </p>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="btn btn-primary">
        Dar acceso a la app
      </button>
    );
  }

  return (
    <form action={action} className="card w-full max-w-md space-y-3 p-4 text-left">
      <input type="hidden" name="debtorId" value={debtorId} />
      <input type="hidden" name="fullName" value={fullName} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="role" value="CLIENT" />

      <div>
        <label htmlFor="email-acceso" className="mb-1.5 block text-sm font-medium text-ink">
          Correo para entrar
        </label>
        <input
          id="email-acceso"
          name="email"
          type="email"
          required
          defaultValue={email ?? ''}
          placeholder="correo@ejemplo.com"
          className="input w-full"
        />
        <p className="mt-1 text-xs text-muted">
          Ahí le llega su contraseña. Puede ser distinto del que tenía antes: sus pagarés van con la
          persona, no con el correo.
        </p>
      </div>

      <div aria-live="polite" className="text-xs">
        {state.error ? <p className="text-crit">{state.error}</p> : null}
      </div>

      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={() => setAbierto(false)} className="btn btn-secondary btn-sm">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? 'Creando…' : 'Crear acceso'}
        </button>
      </div>
    </form>
  );
}
