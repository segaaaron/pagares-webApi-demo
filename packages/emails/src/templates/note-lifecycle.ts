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
  /** Cuántos pagarés se firmaron a la vez: uno, o los de una serie (§12). */
  installments?: number;
  /**
   * Lo pactado, cuando la serie lleva interés (§12).
   *
   * Sin esto el correo decía «12 pagarés» y el importe del primero, y el deudor
   * tenía que multiplicar para saber a cuánto se compromete. Las tres cifras
   * que se acuerdan de viva voz —cuota, precio del préstamo y total— van
   * escritas, que es como no hay malentendido después.
   */
  plan?: {
    totalFormatted: string;
    interestFormatted: string;
  };
}

/** Plantilla 2 (§16): tienes un pagaré por firmar. */
export function noteToSign(data: NoteToSignData): { subject: string; html: string; text: string } {
  /*
   * Una deuda a plazos son varios pagarés firmados el mismo día (§12), y el
   * correo es **uno solo**: doce avisos por una misma operación son doce
   * oportunidades de que el deudor deje de leerlos. Lo que cambia es el texto,
   * que tiene que decir cuántos documentos va a encontrar.
   */
  const enSerie = (data.installments ?? 1) > 1;
  const subject = enSerie
    ? `Tienes ${data.installments} pagarés por firmar`
    : `Tienes un pagaré por firmar · ${data.document.folio}`;
  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${escapeHtml(data.organizationName)} emitió ${
        enSerie
          ? `<strong>${data.installments} pagarés</strong> a tu nombre, uno por cada pago mensual`
          : 'un pagaré a tu nombre'
      }. Revísalo${enSerie ? 's' : ''} con calma y,
      si estás de acuerdo, fírmalo${enSerie ? 's' : ''} desde la aplicación.
    </p>
    ${documentCard(data.document)}
    ${
      enSerie
        ? `<p style="margin:0 0 14px;">Arriba va el primero, que vence antes; los otros ${
            (data.installments ?? 1) - 1
          } están en la aplicación con sus propias fechas.</p>`
        : ''
    }
    ${
      data.plan
        ? `<p style="margin:0 0 14px;">En total pagarás <strong>${escapeHtml(
            data.plan.totalFormatted,
          )}</strong>, de los cuales ${escapeHtml(
            data.plan.interestFormatted,
          )} son el interés del préstamo. Cada pago mensual es de ${escapeHtml(
            data.document.amountFormatted,
          )}.</p>`
        : ''
    }
    ${
      data.hasAccount
        ? ''
        : '<p style="margin:0 0 14px;">Tus datos de acceso llegaron en un correo aparte.</p>'
    }`;

  return {
    subject,
    text: enSerie
      ? `Hola ${data.fullName}:\n\n${data.organizationName} emitió ${data.installments} pagarés a tu nombre, uno por cada pago mensual.\nEl primero es de ${data.document.amountFormatted} y vence el ${data.document.dueDateFormatted} (folio ${data.document.folio}).${
          data.plan
            ? `\n\nEn total pagarás ${data.plan.totalFormatted}, de los cuales ${data.plan.interestFormatted} son el interés del préstamo.`
            : ''
        }\n\nRevísalos y fírmalos en la aplicación: ${data.appUrl}`
      : `Hola ${data.fullName}:\n\n${data.organizationName} emitió un pagaré a tu nombre por ${data.document.amountFormatted}, con vencimiento el ${data.document.dueDateFormatted}.\nFolio: ${data.document.folio}\n\nRevísalo y fírmalo en la aplicación: ${data.appUrl}`,
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
