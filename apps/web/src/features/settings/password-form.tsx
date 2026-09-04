'use client';

import { NavIcon } from '@/shared/ui/icons/nav-icons';
import {
  confirmPasswordChangeAction,
  requestPasswordCodeAction,
  type PasswordState,
} from './password-actions';
import { useBlockingActionState } from '@/shared/ui/blocking';

/**
 * Cambio de la propia contraseña, en dos pasos con código al correo (§10.3).
 *
 * Vive en Ajustes y no en un menú de cuenta porque es la única acción de este
 * panel que trata sobre quien lo usa, y buscarla en otro sitio era el motivo por
 * el que hasta ahora la única forma de cambiarla era pedirle a otro un reset.
 */
export function PasswordForm() {
  const [state, action, pending] = useBlockingActionState<PasswordState, FormData>(
    async (prev, formData) =>
      prev.step === 'idle'
        ? requestPasswordCodeAction(prev, formData)
        : confirmPasswordChangeAction(prev, formData),
    { step: 'idle' },
  );

  return (
    <section className="card overflow-hidden" aria-label="Mi contraseña">
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"
          aria-hidden
        >
          <NavIcon.users />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Mi contraseña</h2>
          <p className="text-xs text-muted">
            Máximo tres cambios por semana. Al cambiarla se cierran las demás sesiones.
          </p>
        </div>
      </header>

      <form action={action} className="space-y-4 px-5 py-5">
        {state.step === 'done' ? (
          <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
            Contraseña cambiada. Las demás sesiones quedaron cerradas; ésta sigue abierta.
          </p>
        ) : state.step === 'sent' ? (
          <>
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">
              Te mandamos un código de seis dígitos. Caduca en diez minutos y sirve una vez.
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
              <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-medium text-ink">
                Contraseña actual
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                className="input"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <p className="text-xs text-muted">
              Al menos 12 caracteres, distinta de las cinco anteriores y que no aparezca en
              filtraciones conocidas.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            Para cambiarla hace falta un código que te llega al correo de la cuenta, más tu
            contraseña actual.
          </p>
        )}

        <div aria-live="polite">
          {state.error ? (
            <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
          ) : null}
        </div>

        {state.step === 'done' ? null : (
          <button type="submit" disabled={pending} className="btn btn-secondary">
            {pending
              ? 'Enviando…'
              : state.step === 'idle'
                ? 'Mandarme el código'
                : 'Cambiar la contraseña'}
          </button>
        )}
      </form>
    </section>
  );
}
