import { baseLayout } from '../layout/base-layout.js';
import { T, escapeHtml } from '../layout/tokens.js';

export interface WelcomeCredentialsData {
  organizationName: string;
  fullName: string;
  email: string;
  temporaryPassword: string;
  expiresInHours: number;
  appUrl: string;
}

/**
 * Plantilla 1 (§16): bienvenida con la contraseña temporal.
 *
 * La temporal viaja por correo porque es el único canal disponible al dar de
 * alta. Se acota diciendo con claridad que caduca y que se cambia al entrar:
 * un usuario que sabe que expira no la deja escrita en el buzón.
 */
export function welcomeCredentials(data: WelcomeCredentialsData): { subject: string; html: string; text: string } {
  const subject = `Tu acceso a ${data.organizationName}`;

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${escapeHtml(data.organizationName)} creó tu cuenta para que consultes y firmes tus pagarés
      desde la aplicación.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${T.accentSoft};border-radius:10px;margin:4px 0 16px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 4px;font-size:12px;color:${T.accentInk};">Tu correo de acceso</p>
        <p style="margin:0 0 12px;font-family:${T.mono};font-size:14px;color:${T.ink};">${escapeHtml(data.email)}</p>
        <p style="margin:0 0 4px;font-size:12px;color:${T.accentInk};">Contraseña temporal</p>
        <p style="margin:0;font-family:${T.mono};font-size:20px;letter-spacing:.06em;color:${T.ink};">${escapeHtml(data.temporaryPassword)}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 14px;">
      <strong>Caduca en ${data.expiresInHours} horas</strong> y deberás cambiarla la primera vez que entres.
      Si vence, pide una nueva a ${escapeHtml(data.organizationName)}.
    </p>
    <p style="margin:0 0 8px;color:${T.muted};font-size:13px;">
      Si no reconoces esta alta, ignora este mensaje y avísale a ${escapeHtml(data.organizationName)}.
    </p>`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    `${data.organizationName} creó tu cuenta para consultar y firmar tus pagarés.`,
    '',
    `Correo: ${data.email}`,
    `Contraseña temporal: ${data.temporaryPassword}`,
    '',
    `Caduca en ${data.expiresInHours} horas y deberás cambiarla al entrar.`,
    `Abrir la aplicación: ${data.appUrl}`,
  ].join('\n');

  return {
    subject,
    text,
    html: baseLayout({
      title: subject,
      preheader: `Tu contraseña temporal caduca en ${data.expiresInHours} horas`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Abrir la aplicación', url: data.appUrl },
      footerNote: 'Nunca compartas tu contraseña. Nadie de la organización te la pedirá.',
    }),
  };
}
