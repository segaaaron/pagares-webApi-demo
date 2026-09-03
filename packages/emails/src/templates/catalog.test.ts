import { describe, expect, it } from 'vitest';
import { TEMPLATE_IDS, type TemplateId } from '../index.js';
import type { DocumentCardData } from '../layout/document-card.js';
import { welcomeCredentials } from './welcome-credentials.js';
import { adminResetPassword } from './admin-reset-password.js';
import { otpCode } from './otp-code.js';
import { passwordChanged } from './password-changed.js';
import { dueReminder } from './due-reminder.js';
import { paymentRegistered } from './payment-registered.js';
import { paymentReceipt, releaseLetter } from './documents.js';
import { adminDigest } from './admin-digest.js';
import {
  accountStatement,
  promiseReminder,
  securityAlert,
  settlementBroken,
  settlementCreated,
} from './collections.js';
import {
  extensionRegistered,
  noteSettled,
  noteSigned,
  noteToSign,
  noteVoided,
} from './note-lifecycle.js';

const ORG = 'Créditos Morelia';
const APP = 'https://app.ejemplo.mx';

const document: DocumentCardData = {
  folio: 'PAG-2026-000128',
  amountFormatted: '$25,000.00 MXN',
  amountInWords: 'VEINTICINCO MIL PESOS 00/100 M.N.',
  balanceFormatted: '$15,000.00 MXN',
  dueDateFormatted: '30 de septiembre de 2026',
  creditorName: ORG,
  statusLabel: 'Vencido',
  statusTone: 'crit',
};

const base = { organizationName: ORG, fullName: 'Juan Pérez', document, appUrl: APP };

type Mail = { subject: string; html: string; text: string };

/**
 * Una entrada por identificador del catálogo de §16. La prueba recorre
 * `TEMPLATE_IDS`, así que **añadir un id sin plantilla rompe el build**: es lo
 * que evita que el catálogo prometa correos que nadie escribió.
 */
const CATALOG: Record<TemplateId, () => Mail> = {
  'welcome-credentials': () =>
    welcomeCredentials({
      organizationName: ORG,
      fullName: 'Juan Pérez',
      email: 'juan@ejemplo.mx',
      temporaryPassword: 'Xk7mQp2rTv9wLz4n',
      expiresInHours: 72,
      appUrl: APP,
    }),
  'note-to-sign': () => noteToSign({ ...base, hasAccount: true }),
  'otp-password-change': () =>
    otpCode({
      organizationName: ORG,
      fullName: 'Juan Pérez',
      code: '482913',
      expiresInMinutes: 10,
      purpose: 'change',
    }),
  'otp-password-reset': () =>
    otpCode({
      organizationName: ORG,
      fullName: 'Juan Pérez',
      code: '482913',
      expiresInMinutes: 10,
      purpose: 'reset',
    }),
  'admin-reset-password': () =>
    adminResetPassword({
      organizationName: ORG,
      fullName: 'Juan Pérez',
      temporaryPassword: 'Xk7mQp2rTv9wLz4n',
      expiresInHours: 72,
      appUrl: APP,
      byName: 'María Ruiz',
    }),
  'note-signed-receipt': () => noteSigned({ ...base, signedAtFormatted: '3 de septiembre de 2026' }),
  'due-reminder': () => dueReminder({ ...base, offsetDays: -3 }),
  'overdue-notice': () => dueReminder({ ...base, offsetDays: 30 }),
  'payment-registered': () =>
    paymentRegistered({
      ...base,
      amountPaidFormatted: '$10,000.00 MXN',
      paidOnFormatted: '3 de septiembre de 2026',
      methodLabel: 'Transferencia',
      isSettled: false,
    }),
  'note-settled': () => noteSettled(base),
  'note-voided': () => noteVoided({ ...base, reason: 'Error de captura' }),
  'weekly-admin-digest': () =>
    adminDigest({
      organizationName: ORG,
      weekLabel: 'del 1 al 7 de septiembre de 2026',
      outstandingFormatted: '$310,000.00 MXN',
      overdueFormatted: '$62,000.00 MXN',
      collectedFormatted: '$48,000.00 MXN',
      nonPerformingFormatted: '$18,000.00 MXN',
      dueThisWeek: 4,
      brokenPromises: 2,
      dashboardUrl: APP,
    }),
  'security-alert': () =>
    securityAlert({
      organizationName: ORG,
      fullName: 'Juan Pérez',
      event: 'account-locked',
      atFormatted: '3 de septiembre de 2026, 14:20',
      ip: '187.190.10.4',
      lockoutHours: 5,
      resetUrl: `${APP}/login/recuperar`,
    }),
  'password-changed': () =>
    passwordChanged({
      organizationName: ORG,
      fullName: 'Juan Pérez',
      changedAtFormatted: '3 de septiembre de 2026, 14:20',
      byAdmin: false,
    }),
  'payment-receipt': () =>
    paymentReceipt({
      ...base,
      receiptFolio: 'REC-2026-000045',
      amountPaidFormatted: '$10,000.00 MXN',
      paidOnFormatted: '3 de septiembre de 2026',
      appliedToInterestFormatted: '$1,200.00 MXN',
      appliedToPrincipalFormatted: '$8,800.00 MXN',
    }),
  'account-statement': () =>
    accountStatement({
      organizationName: ORG,
      fullName: 'Juan Pérez',
      cutoffFormatted: '3 de septiembre de 2026',
      totalBalanceFormatted: '$15,000.00 MXN',
      noteCount: 2,
      appUrl: APP,
    }),
  'release-letter': () =>
    releaseLetter({ ...base, settledOnFormatted: '3 de septiembre de 2026' }),
  'extension-registered': () =>
    extensionRegistered({
      ...base,
      previousDueFormatted: '30 de septiembre de 2026',
      newDueFormatted: '31 de octubre de 2026',
      reason: 'Acuerdo con el cliente',
    }),
  'settlement-created': () =>
    settlementCreated({
      ...base,
      agreedFormatted: '$12,000.00 MXN',
      forgivenFormatted: '$3,000.00 MXN',
      dueOnFormatted: '31 de octubre de 2026',
      terms: 'Dos pagos iguales',
    }),
  'settlement-broken': () => settlementBroken(base),
  'promise-reminder': () =>
    promiseReminder({ ...base, promisedOnFormatted: '10 de septiembre de 2026' }),
};

describe('catálogo de plantillas (§16)', () => {
  it('las 21 plantillas del catálogo tienen implementación', () => {
    expect(Object.keys(CATALOG).sort()).toEqual([...TEMPLATE_IDS].sort());
    expect(TEMPLATE_IDS).toHaveLength(21);
  });

  for (const id of TEMPLATE_IDS) {
    describe(id, () => {
      const mail = CATALOG[id]();

      it('tiene asunto, HTML y texto plano', () => {
        expect(mail.subject.trim().length).toBeGreaterThan(8);
        expect(mail.text.trim().length).toBeGreaterThan(20);
        expect(mail.html).toContain('<!doctype html>');
        // Legible sin imágenes (§16): ninguna plantilla depende de un <img>.
        expect(mail.html).not.toContain('<img');
      });

      it('no deja marcadores sin sustituir', () => {
        expect(mail.html).not.toMatch(/undefined|NaN|\[object Object\]|\{\{/);
        expect(mail.text).not.toMatch(/undefined|NaN|\[object Object\]|\{\{/);
      });

      it('lleva un solo CTA', () => {
        // Dos botones compiten y ninguno se pulsa (§16).
        const ctas = mail.html.match(/<a href="[^"]*"\s+style="display:inline-block/g) ?? [];
        expect(ctas.length).toBeLessThanOrEqual(1);
      });

      it('mantiene el asunto y el texto', () => {
        // El snapshot cubre el asunto y el texto plano, que es lo que se lee y
        // lo que cambia con sentido; el HTML entero haría ilegible el diff.
        expect({ subject: mail.subject, text: mail.text }).toMatchSnapshot();
      });
    });
  }

  it('escapa el HTML de los datos: un nombre no puede inyectar marcado', () => {
    const mail = noteVoided({
      ...base,
      fullName: '<script>alert(1)</script>',
      reason: '"><img src=x onerror=alert(1)>',
    });
    // Lo que importa no es que la cadena "onerror" desaparezca —como texto es
    // inofensiva— sino que no llegue a ser una etiqueta: los `<` van escapados.
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&lt;img src=x');
  });
});
