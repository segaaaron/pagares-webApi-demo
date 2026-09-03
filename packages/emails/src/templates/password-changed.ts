import { baseLayout } from '../layout/base-layout.js';
import { escapeHtml } from '../layout/tokens.js';

export interface PasswordChangedData {
  organizationName: string;
  fullName: string;
  changedAtFormatted: string;
  ip?: string | undefined;
  byAdmin: boolean;
}

/**
 * Plantilla 14 (§16). No es un acuse de cortesía: es la señal que permite al
 * usuario detectar un cambio que él no hizo.
 */
export function passwordChanged(data: PasswordChangedData): { subject: string; html: string; text: string } {
  const subject = data.byAdmin
    ? 'El administrador restableció tu contraseña'
    : 'Tu contraseña se cambió correctamente';

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${
        data.byAdmin
          ? `${escapeHtml(data.organizationName)} restableció tu contraseña el ${escapeHtml(data.changedAtFormatted)}. Se cerraron todas tus sesiones y deberás usar la contraseña temporal que recibiste.`
          : `Tu contraseña se cambió el ${escapeHtml(data.changedAtFormatted)}${data.ip ? ` desde la dirección ${escapeHtml(data.ip)}` : ''}.`
      }
    </p>
    <p style="margin:0 0 8px;">
      <strong>Si no fuiste tú</strong>, comunícate de inmediato con ${escapeHtml(data.organizationName)}.
    </p>`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    data.byAdmin
      ? `${data.organizationName} restableció tu contraseña el ${data.changedAtFormatted}.`
      : `Tu contraseña se cambió el ${data.changedAtFormatted}.`,
    '',
    `Si no fuiste tú, comunícate con ${data.organizationName}.`,
  ].join('\n');

  return {
    subject,
    text,
    html: baseLayout({
      title: subject,
      preheader: 'Aviso de seguridad de tu cuenta',
      organizationName: data.organizationName,
      body,
    }),
  };
}
