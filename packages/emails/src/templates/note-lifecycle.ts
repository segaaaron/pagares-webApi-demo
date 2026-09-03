import { baseLayout } from '../layout/base-layout.js';
import { documentCard, type DocumentCardData } from '../layout/document-card.js';
import { escapeHtml } from '../layout/tokens.js';

interface Base {
  organizationName: string;
  fullName: string;
  document: DocumentCardData;
  appUrl: string;
}

export interface NoteToSignData extends Base {
  hasAccount: boolean;
}

/** Plantilla 2 (§16): tienes un pagaré por firmar. */
export function noteToSign(data: NoteToSignData): { subject: string; html: string; text: string } {
  const subject = `Tienes un pagaré por firmar · ${data.document.folio}`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${escapeHtml(data.organizationName)} emitió un pagaré a tu nombre. Revísalo con calma y,
      si estás de acuerdo, fírmalo desde la aplicación.
    </p>
    ${documentCard(data.document)}
    ${
      data.hasAccount
        ? ''
        : '<p style="margin:0 0 14px;">Tus datos de acceso llegaron en un correo aparte.</p>'
    }`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\n${data.organizationName} emitió un pagaré a tu nombre por ${data.document.amountFormatted}, con vencimiento el ${data.document.dueDateFormatted}.\nFolio: ${data.document.folio}\n\nRevísalo y fírmalo en la aplicación: ${data.appUrl}`,
    html: baseLayout({
      title: subject,
      preheader: `${data.document.amountFormatted} · vence ${data.document.dueDateFormatted}`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Revisar y firmar', url: data.appUrl },
    }),
  };
}

export interface NoteSignedData extends Base {
  signedAtFormatted: string;
}

/** Plantilla 6 (§16): comprobante de firma, con el PDF adjunto. */
export function noteSigned(data: NoteSignedData): { subject: string; html: string; text: string } {
  const subject = `Comprobante de tu pagaré ${data.document.folio}`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Recibimos tu firma el ${escapeHtml(data.signedAtFormatted)}. Adjuntamos el documento en PDF
      para tu resguardo.
    </p>
    ${documentCard(data.document)}`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nRecibimos tu firma el ${data.signedAtFormatted}.\nPagaré ${data.document.folio} por ${data.document.amountFormatted}, con vencimiento el ${data.document.dueDateFormatted}.\nAdjuntamos el PDF.`,
    html: baseLayout({
      title: subject,
      preheader: 'Adjuntamos tu pagaré firmado en PDF',
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mis pagarés', url: data.appUrl },
    }),
  };
}

/** Plantilla 10 (§16): pagaré liquidado, con la carta de finiquito adjunta. */
export function noteSettled(data: Base): { subject: string; html: string; text: string } {
  const subject = `Pagaré ${data.document.folio} liquidado`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Tu pagaré quedó <strong>liquidado en su totalidad</strong>. Adjuntamos la carta de finiquito.
    </p>
    ${documentCard(data.document)}
    <p style="margin:0 0 8px;">Gracias por cumplir.</p>`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nTu pagaré ${data.document.folio} quedó liquidado en su totalidad.\nAdjuntamos la carta de finiquito.`,
    html: baseLayout({
      title: subject,
      preheader: 'Adjuntamos tu carta de finiquito',
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mis pagarés', url: data.appUrl },
    }),
  };
}

export interface NoteVoidedData extends Base {
  reason: string;
}

/** Plantilla 11 (§16): pagaré anulado. */
export function noteVoided(data: NoteVoidedData): { subject: string; html: string; text: string } {
  const subject = `Pagaré ${data.document.folio} anulado`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Te informamos que el pagaré ${escapeHtml(data.document.folio)} fue anulado. No requiere
      ninguna acción de tu parte.
    </p>
    ${documentCard(data.document)}
    <p style="margin:0 0 8px;">Motivo: ${escapeHtml(data.reason)}</p>`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nEl pagaré ${data.document.folio} fue anulado. No requiere acción de tu parte.\nMotivo: ${data.reason}`,
    html: baseLayout({
      title: subject,
      preheader: 'No requiere acción de tu parte',
      organizationName: data.organizationName,
      body,
    }),
  };
}

export interface ExtensionData extends Base {
  previousDueFormatted: string;
  newDueFormatted: string;
  reason: string;
}

/** Plantilla 18 (§16): prórroga registrada. */
export function extensionRegistered(data: ExtensionData): { subject: string; html: string; text: string } {
  const subject = `Nuevo vencimiento de tu pagaré ${data.document.folio}`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Acordamos mover el vencimiento del <strong>${escapeHtml(data.previousDueFormatted)}</strong>
      al <strong>${escapeHtml(data.newDueFormatted)}</strong>. El resto de las condiciones no cambia.
    </p>
    ${documentCard(data.document)}
    <p style="margin:0 0 8px;">Motivo: ${escapeHtml(data.reason)}</p>`;

  return {
    subject,
    text: `Hola ${data.fullName}:\n\nEl vencimiento de tu pagaré ${data.document.folio} pasó del ${data.previousDueFormatted} al ${data.newDueFormatted}.\nMotivo: ${data.reason}`,
    html: baseLayout({
      title: subject,
      preheader: `Nuevo vencimiento: ${data.newDueFormatted}`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mi pagaré', url: data.appUrl },
    }),
  };
}
