import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Money } from './money';

/**
 * El importe se pinta con los centavos atenuados. Lo que ninguna de estas
 * pruebas permite es que se atenúen *quitándolos*: un importe truncado es un
 * importe falso.
 */
function pesos(value: string): { text: string; cents: string[] } {
  const { container } = render(<Money value={value} />);
  return {
    text: container.textContent ?? '',
    cents: [...container.querySelectorAll('.cents')].map((node) => node.textContent ?? ''),
  };
}

describe('importe con centavos atenuados', () => {
  it('no pierde un solo carácter del importe', () => {
    expect(pesos('$45,000.00 MXN').text).toBe('$45,000.00 MXN');
  });

  it('atenúa los centavos y la moneda, no los pesos', () => {
    const { cents } = pesos('$45,000.00 MXN');
    expect(cents).toEqual(['.00', ' MXN']);
  });

  it('un importe sin centavos se pinta igual de entero', () => {
    // La API siempre formatea con centavos; este caso es el del dato de fuera.
    // Sale completo, aunque sin nada atenuado: el importe manda sobre el matiz.
    const { text, cents } = pesos('$45,000 MXN');
    expect(text).toBe('$45,000 MXN');
    expect(cents).toEqual([]);
  });

  it('un importe sin moneda no inventa ninguna', () => {
    const { text, cents } = pesos('$1,234.56');
    expect(text).toBe('$1,234.56');
    expect(cents).toEqual(['.56']);
  });

  it('un negativo conserva el signo', () => {
    // El descuadre de saldo se muestra en negativo (ADR 0007): perder el signo
    // convertiría una diferencia a favor en una deuda.
    expect(pesos('-$300.00 MXN').text).toBe('-$300.00 MXN');
  });

  it('usa cifras de ancho fijo para que la columna cuadre', () => {
    const { container } = render(<Money value="$1.00" />);
    expect(container.firstElementChild?.className).toContain('tnum');
  });
});
