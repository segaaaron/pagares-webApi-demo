'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Avisos efímeros (§19.5).
 *
 * Reglas que no se negocian: el aviso **no roba el foco** —se anuncia por
 * `aria-live`—, se va solo a los 5 s salvo el de error, que espera a que lo
 * cierren porque un fallo que desaparece es un fallo que nadie leyó, y cada
 * variante lleva icono además de color.
 */
export type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<((tone: ToastTone, message: string) => void) | null>(null);

export function useToast(): (tone: ToastTone, message: string) => void {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast necesita <ToastProvider> por encima');
  return push;
}

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, tone, message }]);
      if (tone !== 'error') setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* `polite` y no `assertive`: interrumpir al usuario a media frase sólo
          se justifica en una emergencia, y esto no lo es. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONES: Record<ToastTone, { card: string; icon: ReactNode; label: string }> = {
  success: {
    card: 'border-ok/30 bg-ok-soft text-ok',
    label: 'Listo',
    icon: <path d="m4.5 9 3 3 6-6" />,
  },
  error: {
    card: 'border-crit/30 bg-crit-soft text-crit',
    label: 'Error',
    icon: <path d="M9 5v5m0 3h.01M9 1.5 16.5 15h-15z" />,
  },
  warning: {
    card: 'border-warn/30 bg-warn-soft text-warn',
    label: 'Atención',
    icon: <path d="M9 5.5V10m0 3h.01M9 16.5a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
  },
  info: {
    card: 'border-line-strong bg-surface text-ink-2',
    label: 'Aviso',
    icon: <path d="M9 8v4.5M9 5.5h.01M9 16.5a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
  },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone = TONES[toast.tone];

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-[var(--shadow-pop)] ${tone.card}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0"
        aria-hidden
      >
        {tone.icon}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.08em]">{tone.label}</p>
        <p className="mt-0.5 text-sm leading-snug text-ink">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="-mr-1 shrink-0 rounded p-1 text-muted hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
          <path d="m3.5 3.5 7 7m0-7-7 7" />
        </svg>
      </button>
    </div>
  );
}
