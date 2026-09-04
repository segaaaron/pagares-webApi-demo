'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { PasswordField } from '../../shared/ui/password-field';
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
  /**
   * El aviso lo damos nosotros. El del navegador llega en inglés, tapa el campo
   * y desaparece al primer clic: para una regla que hay que leer entera, es peor
   * que no avisar.
   */
  const [aviso, setAviso] = useState<string | null>(null);

  function validar(datos: FormData): boolean {
    const nueva = String(datos.get('newPassword') ?? '');
    const repetida = String(datos.get('repeat') ?? '');

    if (nueva.length < 12) {
      setAviso(`Te faltan ${12 - nueva.length} caracteres: la contraseña necesita 12.`);
      return false;
    }
    if (nueva !== repetida) {
      setAviso('Las dos contraseñas no coinciden.');
      return false;
    }
    setAviso(null);
    return true;
  }

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
    <form
      action={action}
      noValidate
      onSubmit={(evento) => {
        if (!validar(new FormData(evento.currentTarget))) evento.preventDefault();
      }}
      className="card space-y-4 p-6 shadow-[var(--shadow-card-hover)]"
    >
      <div>
        <PasswordField
          id="newPassword"
          name="newPassword"
          label="Contraseña nueva"
          autoComplete="new-password"
          aria-invalid={aviso !== null}
          onChange={() => setAviso(null)}
        />
        <p className="mt-1 text-xs text-muted">
          Al menos 12 caracteres. No puede ser ninguna de tus cinco anteriores ni una que aparezca
          en filtraciones conocidas.
        </p>
      </div>

      <PasswordField
        id="repeat"
        name="repeat"
        label="Repítela"
        autoComplete="new-password"
        onChange={() => setAviso(null)}
      />

      <div aria-live="polite">
        {aviso ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{aviso}</p>
        ) : null}
        {state.error && !aviso ? (
          <p className="rounded-lg bg-crit-soft px-3 py-2 text-sm text-crit">{state.error}</p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? 'Guardando…' : 'Guardar y entrar'}
      </button>
    </form>
  );
}
