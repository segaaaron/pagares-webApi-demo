import { baseLayout } from '../layout/base-layout.js';
import { documentCard, type DocumentCardData } from '../layout/document-card.js';
import { escapeHtml } from '../layout/tokens.js';

export interface PaymentRegisteredData {
  organizationName: string;
  fullName: string;
  amountPaidFormatted: string;
  paidOnFormatted: string;
  methodLabel: string;
  document: DocumentCardData;
  isSettled: boolean;
  appUrl: string;
}

/** Plantilla 9 (§16): abono registrado, con el saldo restante destacado. */
export function paymentRegistered(data: PaymentRegisteredData): { subject: string; html: string; text: string } {
  const subject = data.isSettled
    ? `Pagaré ${data.document.folio} liquidado`
    : `Recibimos tu pago de ${data.amountPaidFormatted}`;

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${
        data.isSettled
          ? 'Registramos tu último pago y con él queda <strong>liquidado</strong> el pagaré.'
          : `Registramos tu pago de <strong>${escapeHtml(data.amountPaidFormatted)}</strong> del ${escapeHtml(data.paidOnFormatted)} (${escapeHtml(data.methodLabel)}).`
      }
    </p>
    ${documentCard(data.document)}
    <p style="margin:0 0 8px;">Adjuntamos el recibo en PDF para tu registro.</p>`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    data.isSettled
      ? `Tu pagaré ${data.document.folio} quedó liquidado.`
      : `Registramos tu pago de ${data.amountPaidFormatted} del ${data.paidOnFormatted}.`,
    data.document.balanceFormatted ? `Saldo pendiente: ${data.document.balanceFormatted}` : '',
    `Vence: ${data.document.dueDateFormatted}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    text,
    html: baseLayout({
      title: subject,
      preheader: data.document.balanceFormatted
        ? `Saldo pendiente: ${data.document.balanceFormatted}`
        : 'Pagaré liquidado',
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mis pagarés', url: data.appUrl },
    }),
  };
}
