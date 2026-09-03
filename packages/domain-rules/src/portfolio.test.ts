import { describe, expect, it } from 'vitest';
import { classifyAging, classifyPortfolio, suggestStage } from './portfolio.js';

describe('clasificación de cartera', () => {
  it('mantiene en cartera vigente un pagaré vencido con pocos días', () => {
    // El error clásico: confundir "vencido" con "cartera vencida".
    expect(classifyPortfolio(10)).toBe('VIGENTE');
  });

  it('pasa a cartera vencida justo a los 90 días', () => {
    expect(classifyPortfolio(89)).toBe('VIGENTE');
    expect(classifyPortfolio(90)).toBe('VENCIDA');
  });
});

describe('tramos de antigüedad', () => {
  it.each([
    [0, 'CURRENT'],
    [1, 'D1_30'],
    [30, 'D1_30'],
    [31, 'D31_60'],
    [60, 'D31_60'],
    [61, 'D61_90'],
    [90, 'D61_90'],
    [91, 'D91_120'],
    [120, 'D91_120'],
    [121, 'D120_PLUS'],
  ])('con %i días de atraso cae en %s', (days, bucket) => {
    expect(classifyAging(days)).toBe(bucket);
  });
});

describe('etapa sugerida', () => {
  it('es preventiva antes del vencimiento', () => {
    expect(suggestStage(0, 5)).toBe('PREVENTIVA');
  });

  it('es administrativa en el primer mes de atraso', () => {
    expect(suggestStage(15, 0)).toBe('ADMINISTRATIVA');
  });

  it('es extrajudicial entre 31 y 89 días', () => {
    expect(suggestStage(45, 0)).toBe('EXTRAJUDICIAL');
    expect(suggestStage(89, 0)).toBe('EXTRAJUDICIAL');
  });

  it('es judicial a partir de los 90 días', () => {
    expect(suggestStage(90, 0)).toBe('JUDICIAL');
  });
});
