'use client';

import { useId, useState, type ComponentPropsWithoutRef } from 'react';

/**
 * Campo de contraseña con el ojo para verla.
 *
 * Se puede escribir sin equivocarse una contraseña que no se ve, pero no
 * comprobar por qué la que uno cree correcta es rechazada. Ver el texto es lo
 * que convierte un intento fallido en un error entendido, y por eso el ojo
 * empieza cerrado pero está siempre a mano.
 */
type Props = Omit<ComponentPropsWithoutRef<'input'>, 'type'> & { label: string };

export function PasswordField({ label, id, className, ...resto }: Props) {
  const generado = useId();
  const campoId = id ?? generado;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={campoId} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          {...resto}
          id={campoId}
          type={visible ? 'text' : 'password'}
          className={`input pr-11 ${className ?? ''}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // El botón no entra en el orden de tabulación: quien navega con teclado
          // va del campo al siguiente, no a un interruptor de presentación.
          tabIndex={-1}
          aria-label={visible ? 'Ocultar la contraseña' : 'Ver la contraseña'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
        >
          <Ojo tachado={visible} />
        </button>
      </div>
    </div>
  );
}

function Ojo({ tachado }: { tachado: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {tachado ? <path d="m3 3 18 18" /> : null}
    </svg>
  );
}
