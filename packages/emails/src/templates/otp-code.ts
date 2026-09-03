import { baseLayout } from '../layout/base-layout.js';
import { T, escapeHtml } from '../layout/tokens.js';

export interface OtpCodeData {
  organizationName: string;
  fullName: string;
  code: string;
  expiresInMinutes: number;
  purpose: 'change' | 'reset';
  requestedFromIp?: string | undefined;
}

/**
 * Plantillas 3 y 4 (§16): código para cambiar o recuperar la contraseña.
 *
 * Una sola plantilla porque el contenido es el mismo; lo que cambia es el motivo,
 * y eso se decide con datos, no duplicando archivos.
 */
export function otpCode(data: OtpCodeData): { subject: string; html: string; text: string } {
  const isReset = data.purpose === 'reset';
  const subject = isReset ? 'Restablece tu contraseña' : 'Tu código para cambiar la contraseña';

  const body = `
    <p style="margin:0 0 14px;">Hola ${escapeHtml(data.fullName)}:</p>
    <p style="margin:0 0 14px;">
      ${
        isReset
          ? 'Pediste restablecer tu contraseña. Usa este código en la aplicación:'
          : 'Para confirmar el cambio de contraseña, usa este código en la aplicación:'
      }
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${T.accentSoft};border-radius:10px;margin:4px 0 16px;">
      <tr><td align="center" style="padding:20px;">
        <p style="margin:0;font-family:${T.mono};font-size:32px;letter-spacing:.24em;color:${T.ink};">
          ${escapeHtml(data.code)}
        </p>
      </td></tr>
    </table>
    <p style="margin:0 0 14px;">
      Caduca en <strong>${data.expiresInMinutes} minutos</strong> y sólo se puede usar una vez.
    </p>
    ${
      data.requestedFromIp
        ? `<p style="margin:0 0 8px;font-size:13px;color:${T.muted};">Solicitado desde la dirección ${escapeHtml(data.requestedFromIp)}.</p>`
        : ''
    }
    <p style="margin:0 0 8px;font-size:13px;color:${T.muted};">
      Si no fuiste tú, ignora este mensaje: tu contraseña no cambia hasta que se use el código.
    </p>`;

  const text = [
    `Hola ${data.fullName}:`,
    '',
    isReset ? 'Código para restablecer tu contraseña:' : 'Código para cambiar tu contraseña:',
    data.code,
    '',
    `Caduca en ${data.expiresInMinutes} minutos y es de un solo uso.`,
    'Si no fuiste tú, ignora este mensaje.',
  ].join('\n');

  return {
    subject,
    text,
    html: baseLayout({
      title: subject,
      preheader: `Tu código caduca en ${data.expiresInMinutes} minutos`,
      organizationName: data.organizationName,
      body,
      footerNote: 'Nadie de la organización te pedirá este código.',
    }),
  };
}
