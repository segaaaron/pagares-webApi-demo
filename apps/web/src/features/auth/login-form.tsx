'use client';

import { PasswordField } from '../../shared/ui/password-field';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="card space-y-4 p-6 shadow-[var(--shadow-card-hover)]">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
        />
      </div>

      <PasswordField
        id="password"
        name="password"
        label="Contraseña"
        autoComplete="current-password"
        required
      />

      {/* aria-live: el lector de pantalla anuncia el error sin que el foco se mueva. */}
      <div aria-live="polite">
        {state.error ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
