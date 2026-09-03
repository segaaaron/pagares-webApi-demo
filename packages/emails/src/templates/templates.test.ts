import { describe, expect, it } from 'vitest';
import { welcomeCredentials } from './welcome-credentials.js';
import { dueReminder } from './due-reminder.js';
import { paymentRegistered } from './payment-registered.js';

const { balanceFormatted: _balance, ...settledDoc } = {
  folio: 'PAG-2026-000128',
  amountFormatted: '$25,000.00 MXN',
  amountInWords: 'VEINTICINCO MIL PESOS 00/100 M.N.',
  balanceFormatted: '$15,000.00 MXN',
  dueDateFormatted: '30 sep 2026',
  creditorName: 'Empresa Demo S.A.',
  statusLabel: 'Vencido',
};

const doc = {
  folio: 'PAG-2026-000128',
  amountFormatted: '$25,000.00 MXN',
  amountInWords: 'VEINTICINCO MIL PESOS 00/100 M.N.',
  balanceFormatted: '$15,000.00 MXN',
  dueDateFormatted: '30 sep 2026',
  creditorName: 'Empresa Demo S.A.',
  statusLabel: 'Vencido',
  statusTone: 'crit' as const,
};

describe('plantillas de correo', () => {
  it('la bienvenida incluye la temporal y su caducidad', () => {
    const mail = welcomeCredentials({
      organizationName: 'Créditos Morelia',
      fullName: 'Juan Pérez',
      email: 'juan@ejemplo.mx',
      temporaryPassword: 'Xk7mQp2rTv9wLz4n',
      expiresInHours: 72,
      appUrl: 'https://app.ejemplo.mx',
    });
    expect(mail.html).toContain('Xk7mQp2rTv9wLz4n');
    expect(mail.html).toContain('72 horas');
    expect(mail.text).toContain('Xk7mQp2rTv9wLz4n');
  });

  it('escapa el HTML de los datos del usuario', () => {
    // Un nombre con etiquetas no puede inyectar marcado en el correo.
    const mail = welcomeCredentials({
      organizationName: 'Créditos',
      fullName: '<script>alert(1)</script>',
      email: 'a@b.mx',
      temporaryPassword: 'abc',
      expiresInHours: 72,
      appUrl: 'https://app.ejemplo.mx',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('cambia el tono del recordatorio según el tramo', () => {
    const antes = dueReminder({ organizationName: 'C', fullName: 'Juan', offsetDays: -3, document: doc, appUrl: 'https://a.mx' });
    const despues = dueReminder({ organizationName: 'C', fullName: 'Juan', offsetDays: 45, document: doc, appUrl: 'https://a.mx' });
    expect(antes.subject).toContain('vence en 3 días');
    expect(despues.subject).toContain('45 días vencido');
  });

  it('dice "vence hoy" el día del vencimiento', () => {
    const hoy = dueReminder({ organizationName: 'C', fullName: 'Juan', offsetDays: 0, document: doc, appUrl: 'https://a.mx' });
    expect(hoy.subject).toContain('vence hoy');
  });

  it('el abono muestra el saldo restante', () => {
    const mail = paymentRegistered({
      organizationName: 'C',
      fullName: 'Juan',
      amountPaidFormatted: '$10,000.00 MXN',
      paidOnFormatted: '15 sep 2026',
      methodLabel: 'Transferencia',
      document: doc,
      isSettled: false,
      appUrl: 'https://a.mx',
    });
    expect(mail.html).toContain('$15,000.00 MXN');
    expect(mail.subject).toContain('$10,000.00 MXN');
  });

  it('el correo de liquidación no habla de saldo pendiente', () => {
    const mail = paymentRegistered({
      organizationName: 'C',
      fullName: 'Juan',
      amountPaidFormatted: '$15,000.00 MXN',
      paidOnFormatted: '15 sep 2026',
      methodLabel: 'Efectivo',
      // Un pagaré liquidado no lleva saldo: la propiedad se omite, no se pone en undefined.
      document: { ...settledDoc, statusLabel: 'Liquidado', statusTone: 'ok' as const },
      isSettled: true,
      appUrl: 'https://a.mx',
    });
    expect(mail.subject).toContain('liquidado');
    expect(mail.text).not.toContain('Saldo pendiente');
  });

  it('todas incluyen versión de texto plano', () => {
    const mail = dueReminder({ organizationName: 'C', fullName: 'Juan', offsetDays: -1, document: doc, appUrl: 'https://a.mx' });
    expect(mail.text.length).toBeGreaterThan(20);
    expect(mail.text).not.toContain('<');
  });
});

describe('plantillas del ciclo de vida', () => {
  it('el convenio advierte qué pasa si no se cumple', async () => {
    const { settlementCreated } = await import('./collections.js');
    const mail = settlementCreated({
      organizationName: 'Créditos Morelia',
      fullName: 'Juan Pérez',
      document: doc,
      agreedFormatted: '$28,000.00 MXN',
      forgivenFormatted: '$7,000.00 MXN',
      dueOnFormatted: '15 oct 2026',
      terms: null,
      appUrl: 'https://a.mx',
    });
    // Sin este aviso, el deudor puede creer que la quita es incondicional.
    expect(mail.html).toContain('se restablece');
    expect(mail.text).toContain('$7,000.00 MXN');
  });

  it('la alerta de seguridad distingue bloqueo de sesión reutilizada', async () => {
    const { securityAlert } = await import('./collections.js');
    const locked = securityAlert({
      organizationName: 'C',
      fullName: 'Juan',
      event: 'account-locked',
      atFormatted: '2 sep 2026',
      lockoutHours: 5,
      resetUrl: 'https://a.mx/reset',
    });
    const reused = securityAlert({
      organizationName: 'C',
      fullName: 'Juan',
      event: 'refresh-reused',
      atFormatted: '2 sep 2026',
      resetUrl: 'https://a.mx/reset',
    });
    expect(locked.subject).toContain('bloqueó');
    expect(reused.subject).toContain('inusual');
  });

  it('el pagaré anulado dice que no requiere acción', async () => {
    const { noteVoided } = await import('./note-lifecycle.js');
    const mail = noteVoided({
      organizationName: 'C',
      fullName: 'Juan',
      document: doc,
      reason: 'Error de captura',
      appUrl: 'https://a.mx',
    });
    expect(mail.html).toContain('No requiere');
    expect(mail.text).toContain('Error de captura');
  });
});
