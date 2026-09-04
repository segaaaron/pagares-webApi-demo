'use client';

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Velo de espera para todo lo que va al servidor y no tiene esqueleto.
 *
 * Las pantallas que **navegan** ya tienen su esqueleto —`loading.tsx`, que pinta
 * la forma de lo que viene—; esto es para lo otro: registrar un abono, mandar
 * un recordatorio, importar un archivo. Ahí no hay navegación que anunciar y el
 * único aviso era que el botón cambiaba de texto, que es fácil no ver.
 *
 * Y hace algo más que informar: **bloquea la pantalla**. Un abono es dinero, y
 * un segundo clic mientras el primero viaja es el camino corto a registrarlo
 * dos veces. La idempotencia del servidor lo impide (§12.4), pero es mejor que
 * no llegue a ocurrir.
 */
interface Blocking {
  begin: () => void;
  end: () => void;
}

const BlockingContext = createContext<Blocking | null>(null);

export function BlockingProvider({ children }: { children: ReactNode }) {
  // Un contador y no un booleano: dos acciones a la vez —guardar y refrescar—
  // apagarían el velo en cuanto terminara la primera.
  const [pendientes, setPendientes] = useState(0);

  const valor = useMemo<Blocking>(
    () => ({
      begin: () => setPendientes((n) => n + 1),
      end: () => setPendientes((n) => Math.max(0, n - 1)),
    }),
    [],
  );

  return (
    <BlockingContext.Provider value={valor}>
      {children}
      {pendientes > 0 ? <Velo /> : null}
    </BlockingContext.Provider>
  );
}

function Velo() {
  return (
    <div
      // `status` y no `alert`: es progreso, no un problema. El lector de
      // pantalla lo anuncia sin interrumpir lo que esté leyendo.
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-paper/70 backdrop-blur-[2px]"
    >
      <div className="card flex items-center gap-3 px-5 py-4 shadow-[var(--shadow-card-hover)]">
        <span
          className="h-5 w-5 shrink-0 rounded-full border-2 border-line border-t-accent motion-safe:animate-spin"
          aria-hidden
        />
        <p className="text-sm font-medium text-ink">Guardando…</p>
      </div>
    </div>
  );
}

/** Enciende el velo mientras `pending` esté arriba. */
export function useBlocking(pending: boolean): void {
  const blocking = useContext(BlockingContext);

  useEffect(() => {
    if (!pending || !blocking) return;
    blocking.begin();
    // Se apaga también si el componente desaparece a mitad —una fila que se va
    // de la lista al terminar—, o el velo se quedaría puesto para siempre.
    return () => blocking.end();
  }, [pending, blocking]);
}

/**
 * `useActionState` con el velo puesto.
 *
 * Se usa en lugar del de React en toda la aplicación: así ninguna pantalla
 * nueva se queda sin espera por olvido, que es exactamente como se pierde una
 * convención de éstas.
 */
export function useBlockingActionState<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initial: Awaited<State>,
): [State, (payload: Payload) => void, boolean] {
  const [state, dispatch, pending] = useActionState(action, initial);
  useBlocking(pending);
  return [state, dispatch, pending];
}
