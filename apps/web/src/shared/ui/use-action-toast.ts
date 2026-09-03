'use client';

import { useEffect, useRef } from 'react';
import { useToast } from './toast';

/**
 * Convierte el resultado de una Server Action en un aviso.
 *
 * El mensaje junto al campo se queda donde está —es donde se busca cuando algo
 * falla—; el aviso es para el caso contrario: cuando salió bien y el formulario
 * ya no está a la vista. Se dispara sólo cuando el estado cambia, no en cada
 * render, o un re-render repetiría el aviso.
 */
export function useActionToast(
  state: { error?: string | undefined; ok?: unknown },
  successMessage: string,
): void {
  const toast = useToast();
  const seen = useRef<unknown>(null);

  useEffect(() => {
    const current = state.error ?? state.ok ?? null;
    if (current === null || current === seen.current) return;
    seen.current = current;
    if (state.error) toast('error', state.error);
    else toast('success', successMessage);
  }, [state, successMessage, toast]);
}
