import { baseLayout } from '../layout/base-layout.js';
import { T, escapeHtml } from '../layout/tokens.js';

export interface AdminResetPasswordData {
  organizationName: string;
  fullName: string;
  temporaryPassword: string;
  expiresInHours: number;
  appUrl: string;
  /** Quién la restableció: sin esto el correo parece un intento de fraude. */
  byName: string;
}

/**
 * Plantilla 5 (§16): el administrador restableció la contraseña.
 *
 * No es la bienvenida con otro asunto: quien recibe esto ya tenía cuenta y no
 * pidió nada, así que lo primero que necesita saber es **quién** lo hizo y qué
 * hacer si no lo autorizó. Callarlo convierte un correo legítimo en uno
 * indistinguible de una suplantación.
 */
export function adminResetPassword(data: AdminResetPasswordData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Tu contraseña se restableció';

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${escapeHtml(data.byName)}, de ${escapeHtml(data.organizationName)}, restableció tu
      contraseña. Por seguridad se cerraron todas tus sesiones abiertas.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${T.accentSoft};border-radius:10px;margin:4px 0 16px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 4px;font-size:12px;color:${T.accentInk};">Contraseña temporal</p>
        <p style="margin:0;font-family:${T.mono};font-size:20px;letter-spacing:.06em;color:${T.ink};">${escapeHtml(data.temporaryPassword)}</p>
      </td></tr>
    </table>
    <p style="margin:0 0 14px;">
      <strong>Caduca en ${data.expiresInHours} horas</strong> y tendrás que cambiarla en cuanto entres.
    </p>
    <p style="margin:0 0 8px;color:${T.muted};font-size:13px;">
      Si no pediste este restablecimiento, avísale a ${escapeHtml(data.organizationName)} ahora
      mismo: alguien con acceso al panel lo hizo por ti.
    </p>`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    `${data.byName}, de ${data.organizationName}, restableció tu contraseña y se cerraron tus sesiones.`,
    '',
    `Contraseña temporal: ${data.temporaryPassword}`,
    `Caduca en ${data.expiresInHours} horas y deberás cambiarla al entrar.`,
    '',
    `Si no lo pediste, avisa a ${data.organizationName}.`,
    `Abrir la aplicación: ${data.appUrl}`,
  ].join('\n');

  return {
    subject,
    text,
    html: baseLayout({
      title: subject,
      preheader: `Contraseña temporal válida ${data.expiresInHours} horas`,
      organizationName: data.organizationName,
      body,
      cta: { label: 'Entrar y cambiarla', url: data.appUrl },
      footerNote: 'Nunca compartas tu contraseña. Nadie de la organización te la pedirá.',
    }),
  };
}
