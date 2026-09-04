'use client';

/**
 * La consulta pública la abre gente de fuera desde un enlace.
 *
 * No tiene sesión, ni menú, ni a quién preguntar: si falla, lo único honesto es
 * decir que el enlace no se pudo abrir y no dejarle una pantalla muda.
 */
export default function ErrorPublico({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-2 px-6">
      <div className="card max-w-prose p-8 text-center">
        <h1 className="text-xl font-semibold text-ink">No pudimos abrir este pagaré</h1>
        <p className="mt-2 text-sm text-muted">
          El enlace puede haber caducado o el servicio no estar disponible en este momento. Si te lo
          compartieron para verificar un documento, pide que te lo envíen de nuevo.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-5">
          Reintentar
        </button>
      </div>
    </div>
  );
}
