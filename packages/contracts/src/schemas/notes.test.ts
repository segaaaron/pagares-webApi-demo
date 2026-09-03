import { describe, expect, it } from 'vitest';
import { createNoteRequestSchema } from './notes.js';

const valid = {
  debtor: { fullName: 'Juan Pérez', address: 'Av. Madero 100', phone: '+524431234567' },
  issuePlace: 'Morelia',
  issueDate: '2026-09-01',
  paymentPlace: 'Morelia',
  dueDate: '2026-10-01',
  creditorName: 'Empresa Demo S.A.',
  amountCents: '2500000',
};

describe('emisión de pagaré', () => {
  it('acepta una solicitud completa', () => {
    expect(createNoteRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza un vencimiento anterior a la expedición', () => {
    const r = createNoteRequestSchema.safeParse({ ...valid, dueDate: '2026-08-01' });
    expect(r.success).toBe(false);
  });

  it('rechaza un vencimiento igual a la expedición', () => {
    const r = createNoteRequestSchema.safeParse({ ...valid, dueDate: valid.issueDate });
    expect(r.success).toBe(false);
  });

  it('rechaza el folio enviado por el cliente', () => {
    // El folio lo genera el servidor. Aceptarlo permitiría duplicados y suplantación.
    const r = createNoteRequestSchema.safeParse({ ...valid, folio: 'PAG-000001' });
    expect(r.success).toBe(false);
  });

  it('rechaza el estado enviado por el cliente', () => {
    const r = createNoteRequestSchema.safeParse({ ...valid, status: 'PAID' });
    expect(r.success).toBe(false);
  });

  it('rechaza un importe con decimales: son centavos enteros', () => {
    const r = createNoteRequestSchema.safeParse({ ...valid, amountCents: '25000.50' });
    expect(r.success).toBe(false);
  });

  it('acepta null como "sin intereses pactados"', () => {
    const r = createNoteRequestSchema.safeParse({ ...valid, interestRate: null });
    expect(r.success).toBe(true);
  });

  it('distingue cero de null en la tasa', () => {
    const r = createNoteRequestSchema.parse({
      ...valid,
      interestRate: { value: 0, period: 'MONTHLY' },
    });
    expect(r.interestRate).toEqual({ value: 0, period: 'MONTHLY' });
  });

  it('guarda la periodicidad con la que se pactó', () => {
    // "3% mensual" y "3% anual" son deudas muy distintas: el número solo no basta.
    const r = createNoteRequestSchema.parse({
      ...valid,
      interestRate: { value: 3, period: 'MONTHLY' },
    });
    expect(r.interestRate?.period).toBe('MONTHLY');
  });

  it('rechaza una tasa fuera de rango', () => {
    expect(
      createNoteRequestSchema.safeParse({ ...valid, interestRate: { value: 101, period: 'ANNUAL' } })
        .success,
    ).toBe(false);
  });

  it('exige periodicidad: una tasa suelta no dice nada', () => {
    expect(createNoteRequestSchema.safeParse({ ...valid, interestRate: { value: 3 } }).success).toBe(
      false,
    );
  });

  it('exige que los avales coincidan con los declarados', () => {
    const r = createNoteRequestSchema.safeParse({ ...valid, requiresGuarantors: 1, guarantors: [] });
    expect(r.success).toBe(false);
  });

  it('permite emitir sin correo del deudor', () => {
    // Firmará presencialmente: no todo deudor tiene correo.
    expect(createNoteRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('normaliza el correo a minúsculas', () => {
    const r = createNoteRequestSchema.parse({
      ...valid,
      debtor: { ...valid.debtor, email: 'Juan.Perez@EJEMPLO.MX' },
    });
    expect(r.debtor.email).toBe('juan.perez@ejemplo.mx');
  });
});
