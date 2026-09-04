import Link from 'next/link';

/** Una dirección que no existe: se dice y se ofrece salida, no un muro. */
export default function NoEncontrado() {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-2 px-6">
      <div className="max-w-prose text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Esta página no existe</h1>
        <p className="mt-2 text-sm text-muted">
          Puede que el pagaré se haya anulado, que el enlace esté mal copiado o que la dirección haya
          cambiado.
        </p>
        <Link href="/" className="btn btn-primary mt-5">
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
