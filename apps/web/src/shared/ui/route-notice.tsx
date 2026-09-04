'use client';

import { useEffect, useRef } from 'react';
import { useToast, type ToastTone } from './toast';

/**
 * Convierte en aviso el motivo con el que una descarga nos devolvió aquí.
 *
 * Las rutas de descarga se abren en una pestaña: no pueden pintar nada, sólo
 * redirigir. El motivo viaja en la URL y esta pieza lo saca por el mismo canal
 * que el resto de los avisos, en vez de dejar un banner colgado en la página
 * que sigue ahí después de leerlo.
 */
export function RouteNotice({ tone, message }: { tone: ToastTone; message: string }) {
  const push = useToast();
  // React monta dos veces en desarrollo; sin esto el aviso saldría duplicado.
  const mostrado = useRef(false);

  useEffect(() => {
    if (mostrado.current) return;
    mostrado.current = true;
    push(tone, message);
  }, [push, tone, message]);

  return null;
}
