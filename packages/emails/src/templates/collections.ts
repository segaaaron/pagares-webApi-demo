import { baseLayout } from '../layout/base-layout.js';
import { documentCard, type DocumentCardData } from '../layout/document-card.js';
import { T, escapeHtml } from '../layout/tokens.js';

interface Base {
  organizationName: string;
  fullName: string;
  document: DocumentCardData;
  appUrl: string;
}

export interface SettlementData extends Base {
  agreedFormatted: string;
  forgivenFormatted: string;
  dueOnFormatted: string;
  terms: string | null;
}

/** Plantilla 19 (§16): convenio de pago con quita. */
export function settlementCreated(data: SettlementData): { subject: string; html: string; text: string } {
  const subject = `Convenio de pago del pagaré ${data.document.folio}`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">Dejamos por escrito lo que acordamos:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${T.accentSoft};border-radius:10px;margin:4px 0 16px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px;font-size:12px;color:${T.accentInk};">Monto convenido</p>
        <p style="margin:0 0 12px;font-family:${T.mono};font-size:20px;color:${T.ink};">${escapeHtml(data.agreedFormatted)}</p>
        <p style="margin:0 0 6px;font-size:12px;color:${T.accentInk};">Descuento otorgado</p>
        <p style="margin:0 0 12px;font-family:${T.mono};font-size:16px;color:${T.ink};">${escapeHtml(data.forgivenFormatted)}</p>
        <p style="margin:0 0 6px;font-size:12px;color:${T.accentInk};">Fecha límite</p>
        <p style="margin:0;font-size:15px;color:${T.ink};">${escapeHtml(data.dueOnFormatted)}</p>
      </td></tr>
    </table>
    ${data.terms ? `<p style="margin:0 0 14px;">${escapeHtml(data.terms)}</p>` : ''}
    <p style="margin:0 0 14px;">
      <strong>Importante:</strong> si el convenio no se cumple en la fecha acordada, se restablece
      el saldo original del pagaré y el descuento deja de aplicar.
    </p>`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nConvenio del pagaré ${data.document.folio}:\nMonto convenido: ${data.agreedFormatted}\nDescuento: ${data.forgivenFormatted}\nFecha límite: ${data.dueOnFormatted}\n\nSi no se cumple, se restablece el saldo original.`,
    html: baseLayout({
      title: subject,
      preheader: `${data.agreedFormatted} antes del ${data.dueOnFormatted}`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mi pagaré', url: data.appUrl },
    }),
  };
}

/** Plantilla 20 (§16): convenio incumplido. */
export function settlementBroken(data: Base): { subject: string; html: string; text: string } {
  const subject = `El convenio del pagaré ${data.document.folio} venció`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      El convenio que habíamos acordado venció sin completarse, por lo que
      <strong>se restablece el saldo original</strong> del pagaré.
    </p>
    ${documentCard(data.document)}
    <p style="margin:0 0 8px;">
      Si aún puedes regularizarlo, comunícate con nosotros: preferimos acordar antes que escalar.
    </p>`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nEl convenio del pagaré ${data.document.folio} venció sin completarse y se restablece el saldo original: ${data.document.balanceFormatted ?? ''}.\n\nComunícate con nosotros para regularizarlo.`,
    html: baseLayout({
      title: subject,
      preheader: 'Se restablece el saldo original',
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mi pagaré', url: data.appUrl },
    }),
  };
}

export interface PromiseReminderData extends Base {
  promisedOnFormatted: string;
}

/** Plantilla 21 (§16): recordatorio de la promesa de pago, el día antes. */
export function promiseReminder(data: PromiseReminderData): { subject: string; html: string; text: string } {
  const subject = `Mañana vence tu compromiso de pago`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Te recordamos el compromiso de pago que acordamos para el
      <strong>${escapeHtml(data.promisedOnFormatted)}</strong>.
    </p>
    ${documentCard(data.document)}`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nTe recordamos tu compromiso de pago para el ${data.promisedOnFormatted}.\nPagaré ${data.document.folio}, saldo ${data.document.balanceFormatted ?? ''}.`,
    html: baseLayout({
      title: subject,
      preheader: `Compromiso para el ${data.promisedOnFormatted}`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mi pagaré', url: data.appUrl },
    }),
  };
}

export interface StatementEmailData {
  organizationName: string;
  fullName: string;
  cutoffFormatted: string;
  totalBalanceFormatted: string;
  noteCount: number;
  appUrl: string;
}

/** Plantilla 16 (§16): estado de cuenta, con el PDF adjunto. */
export function accountStatement(data: StatementEmailData): { subject: string; html: string; text: string } {
  const subject = `Tu estado de cuenta al ${data.cutoffFormatted}`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Adjuntamos tu estado de cuenta al ${escapeHtml(data.cutoffFormatted)}, con
      ${data.noteCount} ${data.noteCount === 1 ? 'pagaré' : 'pagarés'} y un saldo total de
      <strong>${escapeHtml(data.totalBalanceFormatted)}</strong>.
    </p>
    <p style="margin:0 0 8px;">Si algo no coincide con tus registros, avísanos.</p>`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nAdjuntamos tu estado de cuenta al ${data.cutoffFormatted}.\nSaldo total: ${data.totalBalanceFormatted} en ${data.noteCount} pagarés.`,
    html: baseLayout({
      title: subject,
      preheader: `Saldo total: ${data.totalBalanceFormatted}`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mis pagarés', url: data.appUrl },
    }),
  };
}

export interface SecurityAlertData {
  organizationName: string;
  fullName: string;
  event: 'account-locked' | 'refresh-reused';
  atFormatted: string;
  ip?: string | undefined;
  lockoutHours?: number | undefined;
  resetUrl: string;
}

/** Plantilla 13 (§16): alerta de seguridad. */
export function securityAlert(data: SecurityAlertData): { subject: string; html: string; text: string } {
  const locked = data.event === 'account-locked';
  const subject = locked ? 'Tu cuenta se bloqueó temporalmente' : 'Detectamos un acceso inusual';

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${
        locked
          ? `Hubo varios intentos fallidos de acceso a tu cuenta el ${escapeHtml(data.atFormatted)}, así que la bloqueamos por ${data.lockoutHours ?? 5} horas.`
          : `Detectamos un intento de usar una sesión antigua el ${escapeHtml(data.atFormatted)}. Por precaución cerramos todas tus sesiones.`
      }
    </p>
    ${data.ip ? `<p style="margin:0 0 14px;font-size:13px;color:${T.muted};">Origen: ${escapeHtml(data.ip)}</p>` : ''}
    <p style="margin:0 0 14px;">
      <strong>Si fuiste tú</strong>, no tienes que hacer nada; podrás entrar cuando termine el
      bloqueo. <strong>Si no fuiste tú</strong>, cambia tu contraseña.
    </p>`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\n${locked ? `Tu cuenta se bloqueó por intentos fallidos el ${data.atFormatted}.` : `Detectamos un acceso inusual el ${data.atFormatted}.`}\n\nSi no fuiste tú, cambia tu contraseña: ${data.resetUrl}`,
    html: baseLayout({
      title: subject,
      preheader: locked ? 'Bloqueo temporal por intentos fallidos' : 'Cerramos tus sesiones por precaución',
      organizationName: data.organizationName,
      body,
      cta: { label: 'Cambiar mi contraseña', url: data.resetUrl },
      footerNote: 'Nadie de la organización te pedirá tu contraseña ni tus códigos.',
    }),
  };
}
