'use client';

import { useRouter } from 'next/navigation';
import { TABS } from './tab-list';

/**
 * El estado, como un filtro más y no como diez botones.
 *
 * Diez opciones en fila ocupaban el ancho entero y se leían como secciones de
 * la aplicación. Es una elección entre valores excluyentes —lo que hace un
 * desplegable— y así queda al lado de la búsqueda y las fechas, que es donde el
 * administrador busca los filtros.
 */
export function StateFilter({ params }: { params: URLSearchParams }) {
  const router = useRouter();
  const actual = params.get('tab') ?? 'todos';

  return (
    <div>
      <label htmlFor="estado" className="mb-1.5 block text-sm font-medium text-ink">
        Estado
      </label>
      <select
        id="estado"
        name="tab"
        value={actual}
        onChange={(evento) => {
          const siguiente = new URLSearchParams(params);
          if (evento.target.value === 'todos') siguiente.delete('tab');
          else siguiente.set('tab', evento.target.value);
          // Cambiar de estado reinicia la paginación: el cursor era de otra lista.
          siguiente.delete('cursor');
          siguiente.delete('hist');
          const consulta = siguiente.toString();
          router.push(consulta ? `/pagares?${consulta}` : '/pagares');
        }}
        className="input w-48"
      >
        {TABS.map((tab) => (
          <option key={tab.id} value={tab.id}>
            {tab.label}
          </option>
        ))}
      </select>
    </div>
  );
}
