'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { changeInitialAction, type ChangeInitialState } from './actions';

/**
 * Contraseña nueva en el primer acceso. Dos campos y la política a la vista:
 * enseñar la regla antes del error ahorra el intento fallido.
 */
export function ChangeInitialForm() {
  const [state, action, pending] = useActionState<ChangeInitialState, FormData>(
    changeInitialAction,
    {},
  );

  if (state.expired) {
    return (
      <div className="card space-y-3 p-6">
        <p className="text-sm text-ink">
          El plazo para cambiarla se agotó. Vuelve a entrar con tu contraseña temporal y tendrás
          diez minutos otra vez.
        </p>
        <Link href="/login" className="btn btn-primary w-full">
          Volver al acceso
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-6 shadow-[var(--shadow-card-hover)]">
      <div>
        <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-ink">
          Contraseña nueva
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="input"
        />
        <p className="mt-1 text-xs text-muted">
          Al menos 12 caracteres. No puede ser ninguna de tus cinco anteriores ni una que aparezca
          en filtraciones conocidas.
        </p>
      </div>

      <div>
        <label htmlFor="repeat" className="mb-1.5 block text-sm font-medium text-ink">
          Repítela
        </label>
        <input
          id="repeat"
          name="repeat"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="input"
        />
      </div>

      <div aria-live="polite">
        {state.error ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? 'Guardando…' : 'Guardar y entrar'}
      </button>
    </form>
  );
}
