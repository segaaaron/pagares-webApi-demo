'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Confirmación para acciones que no se deshacen solas (§19.5).
 *
 * Usa el `<dialog>` del navegador con `showModal()`: trae gratis el foco
 * atrapado dentro, el cierre con Escape y el fondo inerte. Reimplementarlo con
 * un `div` obligaría a rehacer las tres cosas, y normalmente sale mal.
 *
 * El hijo es el disparador; al confirmar se envía el formulario que lo
 * contiene, así la acción sigue siendo una Server Action y funciona aunque el
 * JavaScript no haya cargado todavía.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'primary',
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);

  // Sin JavaScript el botón envía el formulario directamente: es preferible
  // una acción sin confirmar a un botón muerto.
  useEffect(() => setReady(true), []);

  return (
    <>
      <button
        ref={trigger}
        type="submit"
        onClick={(event) => {
          if (!ready) return;
          event.preventDefault();
          dialog.current?.showModal();
        }}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-accent-soft/60 hover:text-ink"
      >
        {children}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="confirm-title"
        className="card m-auto w-[22rem] max-w-[calc(100vw-2rem)] p-5 shadow-[var(--shadow-pop)] backdrop:bg-ink/25"
      >
        <h2 id="confirm-title" className="font-serif text-lg font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => dialog.current?.close()}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              dialog.current?.close();
              trigger.current?.form?.requestSubmit();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
