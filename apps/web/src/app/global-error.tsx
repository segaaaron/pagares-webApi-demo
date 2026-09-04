'use client';

/**
 * La última red: un fallo que se lleva por delante hasta el diseño de la página.
 *
 * Reemplaza el documento entero, así que no puede apoyarse en el layout ni en
 * las clases de la aplicación —puede que sea justo eso lo que falló—. Por eso
 * lleva sus colores escritos a mano y no depende de nada.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f2f5f3',
          color: '#16211c',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '38rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', margin: '0 0 8px' }}>La aplicación no pudo cargarse</h1>
          <p style={{ margin: '0 0 20px', color: '#5c6b64', lineHeight: 1.55 }}>
            Vuelve a cargar la página. Si el problema sigue, cierra la pestaña y entra de nuevo desde
            el acceso.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#1f5f4a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Volver a cargar
          </button>
          {error.digest ? (
            <p style={{ marginTop: '16px', fontSize: '12px', color: '#5c6b64' }}>
              Código: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
