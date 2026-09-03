'use client';

import type { ReactNode } from 'react';

/**
 * Acción del dashboard. Cuando el estado del pagaré no permite la acción, el
 * botón se deshabilita **con el motivo visible** (§19.5): ocultarlo esconde la
 * regla y el usuario nunca aprende por qué no puede.
 */
export function ActionButton({
  children,
  onClick,
  disabledReason,
  variant = 'secondary',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabledReason?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const disabled = Boolean(disabledReason);
  // Relieve mínimo: la primaria se levanta del papel, las demás se quedan al ras.
  const styles = {
    primary: 'bg-accent text-white shadow-[var(--shadow-card)] hover:bg-accent-ink hover:shadow-[var(--shadow-card-hover)]',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
    danger: 'bg-surface text-crit border border-crit hover:bg-crit-soft',
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabledReason}
      aria-disabled={disabled}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}
