import { baseLayout } from '../layout/base-layout.js';
import { documentCard, type DocumentCardData } from '../layout/document-card.js';
import { escapeHtml } from '../layout/tokens.js';

export interface DueReminderData {
  organizationName: string;
  fullName: string;
  /** Negativo antes del vencimiento, positivo después: define el tono. */
  offsetDays: number;
  document: DocumentCardData;
  paymentInstructions?: string;
  appUrl: string;
}

/**
 * Plantillas 7 y 8 (§16): recordatorio y aviso de atraso.
 * Es una sola plantilla porque el documento es el mismo; lo que cambia con el
 * tramo es el tono, y eso se decide con datos, no duplicando archivos.
 */
export function dueReminder(data: DueReminderData): { subject: string; html: string; text: string } {
  const { offsetDays } = data;
  const overdue = offsetDays > 0;

  const headline = overdue
    ? offsetDays >= 30
      ? `Tu pagaré ${data.document.folio} lleva ${offsetDays} días vencido`
      : `Tu pagaré ${data.document.folio} está vencido`
    : offsetDays === 0
      ? `Tu pagaré ${data.document.folio} vence hoy`
      : `Tu pagaré ${data.document.folio} vence en ${Math.abs(offsetDays)} días`;

  const message = overdue
    ? offsetDays >= 30
      ? 'Te pedimos regularizar el adeudo o comunicarte con nosotros para acordar una forma de pago.'
      : 'Si ya lo pagaste, ignora este mensaje. Si no, puedes regularizarlo hoy mismo.'
    : 'Te avisamos con tiempo para que puedas organizarte.';

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">${escapeHtml(message)}</p>
    ${documentCard(data.document)}
    ${data.paymentInstructions ? `<p style="margin:0 0 14px;">${escapeHtml(data.paymentInstructions)}</p>` : ''}`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    headline,
    message,
    data.document.balanceFormatted ? `Saldo: ${data.document.balanceFormatted}` : '',
    `Vence: ${data.document.dueDateFormatted}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject: headline,
    text,
    html: baseLayout({
      title: headline,
      preheader: data.document.balanceFormatted ?? headline,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Ver mi pagaré', url: data.appUrl },
    }),
  };
}
