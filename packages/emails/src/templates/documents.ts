import { baseLayout } from '../layout/base-layout.js';
import { documentCard, type DocumentCardData } from '../layout/document-card.js';
import { T, escapeHtml } from '../layout/tokens.js';

interface Base {
  organizationName: string;
  fullName: string;
  document: DocumentCardData;
  appUrl: string;
}

export interface PaymentReceiptData extends Base {
  receiptFolio: string;
  amountPaidFormatted: string;
  paidOnFormatted: string;
  appliedToInterestFormatted: string;
  appliedToPrincipalFormatted: string;
}

/**
 * Plantilla 15 (§16): recibo de abono, con el PDF adjunto.
 *
 * Se distingue de la 9 en el propósito: la 9 avisa de que el abono quedó
 * registrado, ésta **entrega el comprobante**. El desglose entre interés y
 * capital va en el cuerpo porque es la pregunta que llega después de cada
 * recibo, y contestarla antes ahorra la llamada (§12.3).
 */
export function paymentReceipt(data: PaymentReceiptData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Recibo ${data.receiptFolio} · abono de ${data.amountPaidFormatted}`;

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Adjuntamos el recibo <strong>${escapeHtml(data.receiptFolio)}</strong> por el abono de
      ${escapeHtml(data.amountPaidFormatted)} recibido el ${escapeHtml(data.paidOnFormatted)}.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${T.surface2};border-radius:10px;margin:4px 0 16px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0 0 6px;font-size:12px;color:${T.muted};">Aplicado a interés moratorio</p>
        <p style="margin:0 0 12px;font-family:${T.mono};font-size:15px;color:${T.ink};">${escapeHtml(data.appliedToInterestFormatted)}</p>
        <p style="margin:0 0 6px;font-size:12px;color:${T.muted};">Aplicado a capital</p>
        <p style="margin:0;font-family:${T.mono};font-size:15px;color:${T.ink};">${escapeHtml(data.appliedToPrincipalFormatted)}</p>
      </td></tr>
    </table>
    ${documentCard(data.document)}
    <p style="margin:0 0 8px;color:${T.muted};font-size:13px;">
      Guarda este recibo: es el comprobante del abono.
    </p>`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    `Recibo ${data.receiptFolio} por ${data.amountPaidFormatted} del ${data.paidOnFormatted}.`,
    `Aplicado a interés: ${data.appliedToInterestFormatted}`,
    `Aplicado a capital: ${data.appliedToPrincipalFormatted}`,
    `Pagaré ${data.document.folio}, saldo ${data.document.balanceFormatted ?? ''}`,
    '',
    'El recibo va adjunto en PDF.',
  ].join('\n');

  return {
    subject,
    text,
    html: baseLayout({
      title: subject,
      preheader: `Abono de ${data.amountPaidFormatted} · saldo ${data.document.balanceFormatted ?? ''}`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mi pagaré', url: data.appUrl },
    }),
  };
}

export interface ReleaseLetterData extends Base {
  settledOnFormatted: string;
}

/**
 * Plantilla 17 (§16): carta de finiquito, con el PDF adjunto.
 *
 * La 10 celebra que quedó liquidado; ésta entrega el documento que lo prueba
 * frente a terceros. Se dice explícitamente que ya no debe nada, porque es
 * exactamente lo que la carta sirve para demostrar.
 */
export function releaseLetter(data: ReleaseLetterData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Carta de finiquito del pagaré ${data.document.folio}`;

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      Adjuntamos la carta de finiquito del pagaré ${escapeHtml(data.document.folio)}, liquidado el
      ${escapeHtml(data.settledOnFormatted)}. Con ella queda constancia de que
      <strong>no hay adeudo pendiente</strong> por este documento.
    </p>
    ${documentCard(data.document)}
    <p style="margin:0 0 8px;color:${T.muted};font-size:13px;">
      Consérvala: es el comprobante de que el pagaré quedó liquidado.
    </p>`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    `Adjuntamos la carta de finiquito del pagaré ${data.document.folio}, liquidado el ${data.settledOnFormatted}.`,
    'No queda adeudo pendiente por este documento.',
  ].join('\n');

  return {
    subject,
    text,
    html: baseLayout({
      title: subject,
      preheader: `Pagaré ${data.document.folio} liquidado`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mis pagarés', url: data.appUrl },
    }),
  };
}
