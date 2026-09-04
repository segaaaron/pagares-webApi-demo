'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

export interface DebtorHit {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  address: string;
  activeCount: number;
  overdueCount: number;
  behavior: string;
}

/**
 * Elegir deudor existente o dar de alta uno nuevo (§19.6).
 *
 * Importa que el existente se elija y no se vuelva a teclear: si se recaptura,
 * nace otro deudor con el mismo nombre y el historial —saldo, comportamiento,
 * estado de cuenta— queda partido en dos personas que en realidad son una.
 *
 * Al elegir, los campos quedan de sólo lectura y viaja `debtorId`; la API ya
 * acepta esa forma. Al soltarlo, vuelven a estar en blanco y se crea uno.
 */
export function DebtorPicker({
  inputClassName,
  errors,
  preselected,
  onChoose,
}: {
  inputClassName: string;
  errors: Record<string, string>;
  /** Al duplicar un pagaré el deudor ya se sabe: se muestra elegido de entrada. */
  preselected?: DebtorHit | undefined;
  /** Para que el formulario traiga los avales de su pagaré anterior (§19.6). */
  onChoose?: ((hit: DebtorHit | null) => void) | undefined;
}) {
  const id = useId();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<DebtorHit[]>([]);
  const [chosen, setChosen] = useState<DebtorHit | null>(preselected ?? null);
  const [loading, setLoading] = useState(false);
  // El alta manual no se enseña de entrada: aparece cuando la búsqueda no da
  // con nadie o cuando se pide expresamente. Así el caso normal —un cliente que
  // ya existe— es un campo, no ocho.
  const [creating, setCreating] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chosen || term.trim().length < 2) {
      setHits([]);
      return;
    }
    // 250 ms de espera: teclear "María" son cinco pulsaciones, no cinco búsquedas.
    const timer = setTimeout(() => {
      setLoading(true);
      const controller = new AbortController();
      // El `AbortController` cancela la búsqueda anterior al seguir tecleando;
      // el plazo corta la que no vuelve, que si no dejaba el buscador girando.
      const plazo = setTimeout(() => controller.abort(), 10_000);
      fetch(`/pagares/nuevo/deudores?q=${encodeURIComponent(term.trim())}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((data: { results: DebtorHit[] }) => setHits(data.results))
        .catch(() => setHits([]))
        .finally(() => {
          clearTimeout(plazo);
          setLoading(false);
        });
      return () => controller.abort();
    }, 250);
    return () => clearTimeout(timer);
  }, [term, chosen]);

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setHits([]);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative" ref={box}>
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          Buscar deudor existente
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <NavIcon.search />
          </span>
          <input
            id={id}
            value={chosen ? chosen.fullName : term}
            onChange={(event) => setTerm(event.target.value)}
            disabled={chosen !== null}
            placeholder="Nombre, teléfono o correo"
            autoComplete="off"
            className={`${inputClassName} pl-9`}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          Si ya te ha firmado antes, elígelo aquí: así su historial y su saldo siguen siendo los
          mismos. Si no aparece, se captura desde la misma búsqueda.
        </p>

        {!chosen && !creating && (loading || term.trim().length >= 2) ? (
          <ul
            role="listbox"
            aria-label="Deudores encontrados"
            className="card absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto p-1 shadow-[var(--shadow-pop)]"
          >
            {loading && hits.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">Buscando…</li>
            ) : null}

            {!loading && hits.length === 0 ? (
              <li className="px-3 py-3 text-sm">
                <p className="text-muted">
                  No encontramos a <span className="font-medium text-ink">«{term.trim()}»</span>.
                </p>
              </li>
            ) : null}
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => {
                    setChosen(hit);
                    setHits([]);
                    onChoose?.(hit);
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent-soft/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{hit.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {hit.phone}
                      {hit.email ? ` · ${hit.email}` : ' · sin correo'}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-right text-xs text-muted">
                    {hit.activeCount} {hit.activeCount === 1 ? 'vivo' : 'vivos'}
                    {hit.overdueCount > 0 ? (
                      <span className="block text-crit">{hit.overdueCount} vencido</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
            {/* Salida siempre a mano: si no está en el directorio, se captura
                aquí mismo con el nombre ya escrito, sin perder lo tecleado. */}
            <li className="border-t border-line">
              <button
                type="button"
                onClick={() => {
                  setCreating(true);
                  setHits([]);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-accent-ink hover:bg-accent-soft/60"
              >
                <NavIcon.users />
                Capturar a «{term.trim()}» como deudor nuevo
              </button>
            </li>
          </ul>
        ) : null}
      </div>

      {chosen ? (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-accent-soft/50 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{chosen.fullName}</p>
            <p className="truncate text-xs text-muted">
              {chosen.phone}
              {chosen.email ? ` · ${chosen.email}` : ' · sin correo, firmará presencialmente'}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {chosen.activeCount} {chosen.activeCount === 1 ? 'pagaré vivo' : 'pagarés vivos'} ·
              comportamiento {chosen.behavior}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setChosen(null);
              onChoose?.(null);
              setTerm('');
            }}
            className="btn btn-secondary btn-sm"
          >
            Cambiar
          </button>
        </div>
      ) : null}

      {/* Con deudor elegido, sus datos viajan ocultos —la API los valida igual—
          y los campos de captura desaparecen: dejarlos vacíos y obligatorios
          impediría enviar el formulario. */}
      {chosen ? (
        <>
          <input type="hidden" name="debtorId" value={chosen.id} />
          <input type="hidden" name="debtorName" value={chosen.fullName} />
          <input type="hidden" name="debtorPhone" value={chosen.phone} />
          <input type="hidden" name="debtorAddress" value={chosen.address} />
          <input type="hidden" name="debtorEmail" value={chosen.email ?? ''} />
        </>
      ) : creating ? (
        <div className="border-t border-line pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Deudor nuevo
            </p>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="btn btn-ghost btn-sm"
            >
              Volver a buscar
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NewField
              id="debtorName"
              label="Nombre completo"
              error={errors['debtor.fullName']}
              inputClassName={inputClassName}
              required
              minLength={3}
              defaultValue={term.trim()}
            />
            <NewField
              id="debtorPhone"
              label="Teléfono"
              error={errors['debtor.phone']}
              inputClassName={inputClassName}
              required
              placeholder="+524431234567"
            />
            <NewField
              id="debtorAddress"
              label="Domicilio"
              error={errors['debtor.address']}
              inputClassName={inputClassName}
              required
            />
            <NewField
              id="debtorEmail"
              label="Correo (opcional)"
              error={errors['debtor.email']}
              inputClassName={inputClassName}
              type="email"
            />
          </div>

          {/* Lo que va a pasar al crear el pagaré, dicho antes de crearlo: no
              hay que ir a Accesos a dar de alta a nadie. */}
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-accent-soft/50 px-3.5 py-3">
            <span className="mt-0.5 shrink-0 text-accent-ink" aria-hidden>
              <NavIcon.users />
            </span>
            <p className="text-xs leading-relaxed text-ink-2">
              <span className="font-medium text-ink">Con correo:</span> al crear el pagaré se le
              abre su cuenta de acceso, se le envía la contraseña temporal y el aviso para firmar
              desde la aplicación. No hace falta darlo de alta en Accesos.
              <br />
              <span className="font-medium text-ink">Sin correo:</span> firmará presencialmente y
              sus recordatorios serán gestión manual.
            </p>
          </div>
        </div>
      ) : (
        // Ni elegido ni capturando: se recuerda que hay dos caminos.
        <p className="text-xs text-muted">
          ¿Es la primera vez que le prestas?{' '}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="font-medium text-accent-ink hover:underline"
          >
            Captúralo como deudor nuevo
          </button>
          .
        </p>
      )}
    </div>
  );
}


/** Campo del alta manual. El nombre del control es el id, como en la API. */
function NewField({
  id,
  label,
  error,
  inputClassName,
  ...input
}: {
  id: string;
  label: string;
  error?: string | undefined;
  inputClassName: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-2">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        className={inputClassName}
        {...input}
      />
      {error ? <p className="mt-1 text-xs text-crit">{error}</p> : null}
    </div>
  );
}
