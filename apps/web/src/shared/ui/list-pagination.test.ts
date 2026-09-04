import { describe, expect, it } from 'vitest';
import { paginate, PAGE_SIZES } from './list-pagination';

/**
 * Paginación por número de página de las listas que caben en una consulta.
 *
 * Todo lo que entra viene de la URL, y la URL la escribe cualquiera: cada
 * prueba es una forma de teclearla mal que no puede terminar en pantalla vacía
 * ni en una página inexistente.
 */
const rows = Array.from({ length: 100 }, (_, index) => index + 1);

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('paginación de listas completas', () => {
  it('sin parámetros muestra los primeros quince', () => {
    const { page, props } = paginate(rows, params(''));
    expect(page).toHaveLength(15);
    expect(page[0]).toBe(1);
    expect(props).toMatchObject({ total: 100, from: 0, size: 15, current: 1, pages: 7 });
  });

  it('la segunda página empieza donde acabó la primera', () => {
    const { page, props } = paginate(rows, params('p=2'));
    expect(page[0]).toBe(16);
    expect(props.from).toBe(15);
  });

  it('un tamaño que no está en la lista cae al de siempre', () => {
    // `?tam=5000` traería la tabla entera al navegador; se ignora.
    expect(paginate(rows, params('tam=5000')).props.size).toBe(15);
    expect(paginate(rows, params('tam=abc')).props.size).toBe(15);
  });

  it('acepta los tres tamaños ofrecidos', () => {
    for (const size of PAGE_SIZES) {
      expect(paginate(rows, params(`tam=${size}`)).props.size).toBe(size);
    }
  });

  it('una página más allá del final devuelve la última, no una vacía', () => {
    const { page, props } = paginate(rows, params('p=99'));
    expect(props.current).toBe(7);
    expect(page).toHaveLength(10);
  });

  it('una página negativa o cero devuelve la primera', () => {
    expect(paginate(rows, params('p=-3')).props.current).toBe(1);
    expect(paginate(rows, params('p=0')).props.current).toBe(1);
  });

  it('una lista vacía sigue teniendo una página', () => {
    // Con `pages: 0` el pie mostraría "1 / 0" y el botón de siguiente quedaría
    // activo sobre la nada.
    const { page, props } = paginate([], params(''));
    expect(page).toEqual([]);
    expect(props).toMatchObject({ total: 0, current: 1, pages: 1 });
  });

  it('una lista más corta que la página cabe entera', () => {
    const { page, props } = paginate([1, 2, 3], params(''));
    expect(page).toHaveLength(3);
    expect(props.pages).toBe(1);
  });
});
