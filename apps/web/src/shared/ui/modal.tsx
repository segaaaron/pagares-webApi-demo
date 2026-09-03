'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Diálogo del sistema. Uno solo para toda la aplicación.
 *
 * Usa el `<dialog>` nativo con `showModal()`: trae el foco atrapado, el cierre
 * con Escape y el fondo inerte sin escribir una línea de JavaScript para ello.
 * Reimplementarlo con un `div` obligaría a rehacer las tres cosas, y suele
 * salir mal.
 *
 * `open` se controla desde fuera para que el formulario de dentro pueda
 * cerrarlo cuando la acción termina bien.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = '32rem',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      // El cierre puede venir de Escape o del backdrop: hay que enterarse.
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      aria-labelledby="modal-title"
      className="card m-auto w-[calc(100vw-2rem)] p-0 shadow-[var(--shadow-pop)] backdrop:bg-ink/30 backdrop:backdrop-blur-[2px]"
      style={{ maxWidth: width }}
    >
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="modal-title" className="font-serif text-lg font-semibold text-ink">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
            <path d="m4 4 8 8m0-8-8 8" />
          </svg>
        </button>
      </header>
      {children}
    </dialog>
  );
}

/** Pequeño ayudante para no repetir el par estado + apertura en cada pantalla. */
export function useModal(): {
  open: boolean;
  show: () => void;
  hide: () => void;
} {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}
