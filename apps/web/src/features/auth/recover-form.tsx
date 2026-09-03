'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPasswordAction, resetPasswordAction, type RecoverState } from './actions';

/**
 * Recuperación en dos pasos: pedir el código y usarlo (§10.3, flujo 4).
 *
 * El primer paso responde lo mismo exista o no la cuenta, así que el mensaje
 * está redactado para ser cierto en los dos casos: "si esa cuenta existe".
 */
export function RecoverForm() {
  const [state, action, pending] = useActionState<RecoverState, FormData>(
    async (prev, formData) =>
      prev.step === 'request'
        ? forgotPasswordAction(prev, formData)
        : resetPasswordAction(prev, formData),
    { step: 'request' },
  );

  if (state.step === 'done') {
    return (
      <div className="card space-y-3 p-6">
        <p className="text-sm text-ink">
          Contraseña cambiada. Por seguridad se cerraron todas las sesiones abiertas, incluida la
          de la aplicación.
        </p>
        <Link href="/login" className="btn btn-primary w-full">
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-6 shadow-[var(--shadow-card-hover)]">
      {state.step === 'request' ? (
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
          <p className="mt-1 text-xs text-muted">
            Te llega un código de seis dígitos, válido diez minutos y de un solo uso.
          </p>
        </div>
      ) : (
        <>
          <input type="hidden" name="email" value={state.email ?? ''} />
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
            Si <span className="font-medium">{state.email}</span> tiene cuenta, ahí está el código.
            Caduca en diez minutos.
          </p>

          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-ink">
              Código
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              className="input font-mono tracking-[0.3em]"
            />
          </div>

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
            <p className="mt-1 text-xs text-muted">Al menos 12 caracteres, distinta de las cinco anteriores.</p>
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
        </>
      )}

      <div aria-live="polite">
        {state.error ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending
          ? 'Enviando…'
          : state.step === 'request'
            ? 'Enviarme el código'
            : 'Cambiar la contraseña'}
      </button>

      <Link href="/login" className="block text-center text-xs text-muted underline">
        Volver al acceso
      </Link>
    </form>
  );
}
