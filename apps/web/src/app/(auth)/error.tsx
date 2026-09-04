'use client';

/**
 * Un fallo en el acceso deja a alguien fuera del sistema.
 *
 * Es la pantalla más delicada: quien la ve todavía no está dentro y no tiene
 * menú al que volver. Sin esto se quedaba mirando una página en blanco sin
 * saber si el problema era su contraseña, su conexión o el servidor.
 */
export default function ErrorAcceso({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-2 px-6">
      <div className="card max-w-prose p-8 text-center">
        <h1 className="text-xl font-semibold text-ink">No pudimos cargar el acceso</h1>
        <p className="mt-2 text-sm text-muted">
          Puede ser un corte momentáneo. Inténtalo de nuevo; si sigue igual en unos minutos, avisa a
          quien administra el sistema.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-secondary">
            Reintentar
          </button>
          <a href="/login" className="btn btn-primary">
            Volver al acceso
          </a>
        </div>
      </div>
    </div>
  );
}
