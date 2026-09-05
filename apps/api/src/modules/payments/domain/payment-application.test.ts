import { describe, expect, it } from 'vitest';
import { splitPayment } from './payment-application.js';

/**
 * Cómo se reparte un abono (§12.3, ADR 0020).
 *
 * Tres conceptos y un orden: moratorio, interés ordinario y capital. El orden no
 * es preferencia nuestra —art. 2094 del Código Civil Federal— y decide qué le
 * queda debiendo al deudor, así que cada regla tiene aquí su prueba.
 */
const base = { lateInterestCents: 0n, ordinaryInterestPendingCents: 0n, interestFirst: true };

describe('aplicación del abono', () => {
  it('cubre primero el moratorio', () => {
    // Es la deuda más antigua y la única que sigue creciendo sola.
    const split = splitPayment({ ...base, amountCents: 100_000n, lateInterestCents: 30_000n });

    expect(split.toInterestCents).toBe(30_000n);
    expect(split.toOrdinaryInterestCents).toBe(0n);
    expect(split.toPrincipalCents).toBe(70_000n);
  });

  it('después el interés ordinario, y sólo entonces el capital', () => {
    /*
     * El precio del préstamo es lo segundo. Antes se registraba como capital, y
     * el recibo le decía al deudor que había pagado capital cuando pagó interés.
     */
    const split = splitPayment({
      amountCents: 602_773n,
      lateInterestCents: 0n,
      ordinaryInterestPendingCents: 180_000n,
      interestFirst: true,
    });

    expect(split.toInterestCents).toBe(0n);
    expect(split.toOrdinaryInterestCents).toBe(180_000n);
    expect(split.toPrincipalCents).toBe(422_773n);
  });

  it('los dos intereses juntos, cada uno en lo suyo', () => {
    const split = splitPayment({
      amountCents: 700_000n,
      lateInterestCents: 50_000n,
      ordinaryInterestPendingCents: 180_000n,
      interestFirst: true,
    });

    expect(split.toInterestCents).toBe(50_000n);
    expect(split.toOrdinaryInterestCents).toBe(180_000n);
    expect(split.toPrincipalCents).toBe(470_000n);
  });

  it('si el abono no alcanza, todo va al moratorio', () => {
    const split = splitPayment({
      amountCents: 20_000n,
      lateInterestCents: 30_000n,
      ordinaryInterestPendingCents: 180_000n,
      interestFirst: true,
    });

    expect(split.toInterestCents).toBe(20_000n);
    expect(split.toOrdinaryInterestCents).toBe(0n);
    expect(split.toPrincipalCents).toBe(0n);
  });

  it('si alcanza para la mora y parte del ordinario, el capital no baja', () => {
    // Que el capital baje mientras quedan intereses vivos es justo lo que el
    // orden del 2094 evita.
    const split = splitPayment({
      amountCents: 100_000n,
      lateInterestCents: 30_000n,
      ordinaryInterestPendingCents: 180_000n,
      interestFirst: true,
    });

    expect(split.toOrdinaryInterestCents).toBe(70_000n);
    expect(split.toPrincipalCents).toBe(0n);
  });

  it('sin intereses pendientes, todo va a capital', () => {
    const split = splitPayment({ ...base, amountCents: 100_000n });
    expect(split.toPrincipalCents).toBe(100_000n);
  });

  it('respeta la configuración inversa', () => {
    const split = splitPayment({
      amountCents: 100_000n,
      lateInterestCents: 30_000n,
      ordinaryInterestPendingCents: 180_000n,
      interestFirst: false,
    });

    expect(split.toInterestCents).toBe(0n);
    expect(split.toOrdinaryInterestCents).toBe(0n);
    expect(split.toPrincipalCents).toBe(100_000n);
  });

  it('nunca reparte más de lo abonado', () => {
    // La suma de los tres conceptos es el abono, siempre: si sobrara o faltara
    // un centavo, el saldo dejaría de cuadrar con el libro.
    for (const [importe, mora, ordinario] of [
      [50_000n, 999_000n, 999_000n],
      [1n, 0n, 5n],
      [700_000n, 50_000n, 180_000n],
    ] as const) {
      const split = splitPayment({
        amountCents: importe,
        lateInterestCents: mora,
        ordinaryInterestPendingCents: ordinario,
        interestFirst: true,
      });
      expect(
        split.toInterestCents + split.toOrdinaryInterestCents + split.toPrincipalCents,
      ).toBe(importe);
    }
  });

  it('un concepto en negativo no reparte dinero al revés', () => {
    // Puede pasar si una reversa dejó un pendiente por debajo de cero.
    const split = splitPayment({
      amountCents: 100_000n,
      lateInterestCents: -5_000n,
      ordinaryInterestPendingCents: -1n,
      interestFirst: true,
    });

    expect(split.toInterestCents).toBe(0n);
    expect(split.toOrdinaryInterestCents).toBe(0n);
    expect(split.toPrincipalCents).toBe(100_000n);
  });
});
