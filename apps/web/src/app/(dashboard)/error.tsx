'use client';

import { useEffect } from 'react';

/**
 * Lo que se ve cuando algo falla dentro del panel.
 *
 * Sin esto, cualquier error —el servidor caído, una acción de una versión
 * anterior que ya no existe tras un despliegue— dejaba una pantalla en blanco
 * con una frase en inglés sobre la consola del navegador. El administrador no
 * sabía si había perdido lo que estaba escribiendo ni qué hacer a continuación.
 *
 * Aquí se dice las dos cosas: qué pasó y cómo seguir. El menú permanece, así
 * que la aplicación no se siente muerta.
 */
export default function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Al servidor ya llegó; esto es para verlo también desde el navegador.
    console.error('[panel]', error);
  }, [error]);

  // Tras un despliegue, la pestaña abierta conserva referencias que el servidor
  // nuevo ya no reconoce. No es un fallo del dato: es una página caducada.
  const esVersionVieja =
    error.message.includes('Server Action') || error.message.includes('deployment');

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-prose text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {esVersionVieja ? 'Página caducada' : 'Algo falló'}
        </p>

        <h1 className="mt-2 text-2xl font-semibold text-ink">
          {esVersionVieja ? 'Esta pestaña quedó en una versión anterior' : 'No pudimos completar eso'}
        </h1>

        <p className="mt-2 text-sm text-muted">
          {esVersionVieja
            ? 'La aplicación se actualizó mientras la tenías abierta. Nada de lo que hiciste se perdió: vuelve a cargar y repite la acción.'
            : 'El error quedó registrado. Puedes reintentar; si vuelve a ocurrir, avisa con el código de abajo.'}
        </p>

        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-secondary">
            Reintentar
          </button>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
            Volver a cargar
          </button>
        </div>

        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-muted">Código: {error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
