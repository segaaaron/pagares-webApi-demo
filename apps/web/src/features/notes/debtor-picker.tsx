'use client';

import Link from 'next/link';

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
 * Aquí sólo se **elige**. Dar de alta se hace en Deudores: hacerlo también aquí
 * dejaba dos capturas de la misma persona, con campos distintos, y ya habían
 * divergido —una pedía notas, la otra no, y ninguna la CURP—.
 */
export function DebtorPicker({
  inputClassName,
  preselected,
  onChoose,
}: {
  inputClassName: string;
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
  /*
   * La lista se abre al entrar al campo, sin escribir nada.
   *
   * Antes había que teclear dos letras para ver algo, así que quien no se sabía
   * el nombre exacto se quedaba mirando un campo vacío sin saber si el deudor
   * estaba o no. Abrirla de entrada contesta la primera pregunta —¿a quién le
   * he prestado?— y teclear sólo filtra.
   */
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chosen || !open) {
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
  }, [term, chosen, open]);

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
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
            onFocus={() => setOpen(true)}
            disabled={chosen !== null}
            placeholder="Nombre, teléfono o correo"
            autoComplete="off"
            className={`${inputClassName} pl-9`}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          Elígelo aquí para que su historial y su saldo sigan siendo los mismos. Si todavía no
          está, se da de alta en Deudores y vuelves.
        </p>

        {!chosen && open ? (
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
                {term.trim() ? (
                  <p className="text-ink-2">
                    No existe ningún deudor que se llame{' '}
                    <span className="font-medium text-ink">«{term.trim()}»</span>. Hay que darlo de
                    alta antes de emitirle un pagaré.
                  </p>
                ) : (
                  <p className="text-muted">
                    Todavía no hay deudores. El primero se da de alta en Deudores.
                  </p>
                )}
              </li>
            ) : null}
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => {
                    setChosen(hit);
                    setOpen(false);
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
            {/* Salida siempre a mano, y lleva a donde se dan de alta las
                fichas. Capturarlo aquí creaba una segunda captura de la misma
                persona, con otros campos. */}
            <li className="border-t border-line">
              <Link
                href="/clientes"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-accent-ink hover:bg-accent-soft/60"
              >
                <NavIcon.clients />
                {term.trim() ? `Dar de alta a «${term.trim()}»` : 'Dar de alta un deudor'}
              </Link>
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
      ) : (
        /*
         * Aquí no se dan de alta deudores.
         *
         * Se hacía, y con otros campos que los de Deudores: dos capturas de la
         * misma persona que ya habían divergido —una pedía notas, la otra no, y
         * ninguna la CURP—. Un pagaré se cuelga de una ficha, así que la ficha
         * va antes y se hace donde se hacen las fichas.
         */
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/60 px-3.5 py-3">
          <span className="mt-0.5 shrink-0 text-muted" aria-hidden>
            <NavIcon.clients />
          </span>
          <div className="text-xs leading-relaxed text-ink-2">
            <p>
              <span className="font-medium text-ink">¿No aparece?</span> Un pagaré se cuelga de una
              persona, así que primero se da de alta en Deudores: nombre, domicilio y teléfono. El
              correo es opcional —con él firma desde la aplicación; sin él, presencialmente—.
            </p>
            <p className="mt-1.5">
              Al volver aquí lo encuentras escribiendo su nombre o su teléfono.
            </p>
            <Link
              href="/clientes"
              className="mt-2.5 inline-flex btn btn-secondary btn-sm"
            >
              Dar de alta un deudor
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

