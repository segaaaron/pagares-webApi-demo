import { baseLayout } from '../layout/base-layout.js';
import { T, escapeHtml } from '../layout/tokens.js';

export interface AdminDigestData {
  organizationName: string;
  weekLabel: string;
  outstandingFormatted: string;
  overdueFormatted: string;
  collectedFormatted: string;
  nonPerformingFormatted: string;
  dueThisWeek: number;
  brokenPromises: number;
  dashboardUrl: string;
}

/** Plantilla 12 (§16): resumen semanal, sólo para administradores. */
export function adminDigest(data: AdminDigestData): { subject: string; html: string; text: string } {
  const subject = `Resumen de la semana · ${data.weekLabel}`;

  const row = (label: string, value: string): string =>
    `<tr>
      <td style="padding:7px 0;font-size:13px;color:${T.muted};">${escapeHtml(label)}</td>
      <td style="padding:7px 0;font-size:14px;color:${T.ink};text-align:right;font-family:${T.mono};">${escapeHtml(value)}</td>
    </tr>`;

  const body = `
    <p style="margin:0 0 14px;">Así cerró la semana:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid ${T.line};border-radius:10px;margin-bottom:16px;">
      <tr><td style="padding:14px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Saldo por cobrar', data.outstandingFormatted)}
          ${row('Vencido', data.overdueFormatted)}
          ${row('Cartera vencida (90+)', data.nonPerformingFormatted)}
          ${row('Cobrado', data.collectedFormatted)}
          ${row('Vencen esta semana', String(data.dueThisWeek))}
          ${row('Promesas incumplidas', String(data.brokenPromises))}
        </table>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:${T.muted};">
      El detalle y las acciones pendientes están en la bandeja de Hoy.
    </p>`;

  return {
    subject,
    text: [
      `Resumen de la semana · ${data.weekLabel}`,
      '',
      `Saldo por cobrar: ${data.outstandingFormatted}`,
      `Vencido: ${data.overdueFormatted}`,
      `Cartera vencida (90+): ${data.nonPerformingFormatted}`,
      `Cobrado: ${data.collectedFormatted}`,
      `Vencen esta semana: ${data.dueThisWeek}`,
      `Promesas incumplidas: ${data.brokenPromises}`,
    ].join('\n'),
    html: baseLayout({
      title: subject,
      preheader: `Por cobrar ${data.outstandingFormatted} · vencido ${data.overdueFormatted}`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Abrir el panel', url: data.dashboardUrl },
    }),
  };
}
