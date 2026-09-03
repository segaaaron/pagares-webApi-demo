export * from './layout/base-layout.js';
export * from './layout/document-card.js';
export * from './layout/tokens.js';
export * from './templates/welcome-credentials.js';
export * from './templates/due-reminder.js';
export * from './templates/payment-registered.js';
export * from './templates/otp-code.js';
export * from './templates/password-changed.js';
export * from './templates/note-lifecycle.js';
export * from './templates/collections.js';
export * from './templates/admin-digest.js';
export * from './templates/admin-reset-password.js';
export * from './templates/documents.js';
export * from './templates/reminder-router.js';

/**
 * Identificadores estables de las plantillas (§16). Los referencian los eventos
 * de dominio y las reglas de recordatorio: cambiar uno rompe esas referencias,
 * así que se añaden, no se renombran.
 */
export const TEMPLATE_IDS = [
  'welcome-credentials',
  'note-to-sign',
  'otp-password-change',
  'otp-password-reset',
  'admin-reset-password',
  'note-signed-receipt',
  'due-reminder',
  'overdue-notice',
  'payment-registered',
  'note-settled',
  'note-voided',
  'weekly-admin-digest',
  'security-alert',
  'password-changed',
  'payment-receipt',
  'account-statement',
  'release-letter',
  'extension-registered',
  'settlement-created',
  'settlement-broken',
  'promise-reminder',
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];
