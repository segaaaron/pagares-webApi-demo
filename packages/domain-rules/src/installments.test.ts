import { describe, expect, it } from 'vitest';
import { MAX_INSTALLMENTS, splitAmount, installmentDates } from './installments.js';

/**
 * Serie de pagarés, uno por mensualidad (§12).
 *
 * Un pagaré es de pago único: no admite calendario dentro. Documentar doce
 * mensualidades es firmar doce pagarés, numerados «3 de 12», cada uno con su
 * vencimiento. Es lo que se hace con el talonario de papel, y tiene una ventaja
 * que no es de forma: si el deudor falla la quinta, se demanda **esa**, que ya
 * venció, sin esperar a que venza el resto.
 */
describe('reparto del importe', () => {
  it('un solo pago es el importe entero', () => {
    expect(splitAmount(2_500_000n, 1)).toEqual([2_500_000n]);
  });

  it('reparte en partes iguales cuando la división es exacta', () => {
    expect(splitAmount(1_200_000n, 3)).toEqual([400_000n, 400_000n, 400_000n]);
  });

  it('la suma de las cuotas es exactamente el importe', () => {
    // La regla que no se puede romper: si sobra o falta un centavo, el deudor
    // acaba debiendo algo que nadie sabe explicar.
    for (const [total, cuotas] of [
      [1_000_000n, 3],
      [999_999n, 7],
      [100n, 3],
      [8_333_333n, 12],
    ] as const) {
      const partes = splitAmount(total, cuotas);
      expect(partes).toHaveLength(cuotas);
      expect(partes.reduce((suma, parte) => suma + parte, 0n)).toBe(total);
    }
  });

  it('el sobrante cae en la primera cuota, no en la última', () => {
    // $10,000 entre 3 son 3,333.33 y sobra un centavo. Va en la primera: el
    // deudor paga el resto en cifras redondas, y lo desigual queda atrás cuanto
    // antes en vez de esperarle al final.
    expect(splitAmount(1_000_000n, 3)).toEqual([333_334n, 333_333n, 333_333n]);
  });

  it('ninguna cuota queda en cero', () => {
    // Un pagaré por cero pesos no es un pagaré: si el importe no llega ni a un
    // centavo por cuota, el reparto no es válido.
    expect(() => splitAmount(2n, 3)).toThrow('installments_amount_too_small');
  });

  it('importes pequeños se reparten mientras den al menos un centavo', () => {
    // 200 centavos entre 3 son 68, 66 y 66: raro, pero legítimo y suma exacto.
    expect(splitAmount(200n, 3)).toEqual([68n, 66n, 66n]);
  });

  it('rechaza un número de cuotas fuera de rango', () => {
    expect(() => splitAmount(1_000_000n, 0)).toThrow('installments_out_of_range');
    expect(() => splitAmount(1_000_000n, MAX_INSTALLMENTS + 1)).toThrow(
      'installments_out_of_range',
    );
  });
});

describe('vencimientos mensuales', () => {
  it('el primero es la fecha pactada, y los demás van mes a mes', () => {
    expect(installmentDates('2026-01-15', 3)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('cruza el fin de año sin perderse', () => {
    expect(installmentDates('2026-11-30', 3)).toEqual(['2026-11-30', '2026-12-30', '2027-01-30']);
  });

  it('el día 31 cae al último día del mes que no lo tiene', () => {
    // Sin esto, el 31 de enero se desbordaba al 3 de marzo, y el pagaré vencía
    // un mes más tarde de lo pactado.
    expect(installmentDates('2026-01-31', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('el 29 de febrero de un año bisiesto también', () => {
    expect(installmentDates('2028-02-29', 2)).toEqual(['2028-02-29', '2028-03-29']);
  });

  it('una sola cuota es una sola fecha', () => {
    expect(installmentDates('2026-05-10', 1)).toEqual(['2026-05-10']);
  });

  it('rechaza un número de cuotas fuera de rango', () => {
    expect(() => installmentDates('2026-01-15', 0)).toThrow('installments_out_of_range');
  });
});
