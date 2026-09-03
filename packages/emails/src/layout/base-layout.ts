import { T, escapeHtml } from './tokens.js';

export interface LayoutOptions {
  title: string;
  preheader: string;
  organizationName: string;
  body: string;
  /** Un solo CTA por correo: dos compiten y ninguno se pulsa. */
  cta?: { label: string; url: string };
  footerNote?: string;
}

/**
 * Estructura común de todos los correos. Tablas, no flexbox: es lo único que
 * Outlook renderiza igual. Ancho fijo de 600 px y todo el texto legible sin
 * imágenes, porque muchos clientes las bloquean por omisión.
 */
export function baseLayout(options: LayoutOptions): string {
  const { title, preheader, organizationName, body, cta, footerNote } = options;

  return `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${T.paper};font-family:${T.sans};color:${T.ink};">
  <!-- Texto de vista previa: lo que se ve en la bandeja antes de abrir. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.paper};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="${T.width}" cellpadding="0" cellspacing="0"
               style="width:${T.width}px;max-width:100%;background:${T.surface};border:1px solid ${T.line};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px 8px;border-bottom:1px solid ${T.line};">
              <p style="margin:0;font-family:${T.mono};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${T.accentInk};">
                ${escapeHtml(organizationName)}
              </p>
              <h1 style="margin:8px 0 16px;font-family:${T.serif};font-size:22px;line-height:1.25;font-weight:600;color:${T.ink};">
                ${escapeHtml(title)}
              </h1>
            </td>
          </tr>
          <tr><td style="padding:20px 28px 4px;font-size:15px;line-height:1.6;color:${T.ink2};">${body}</td></tr>
          ${
            cta
              ? `<tr><td style="padding:8px 28px 28px;">
                  <a href="${escapeHtml(cta.url)}"
                     style="display:inline-block;background:${T.accent};color:#fff;text-decoration:none;
                            padding:11px 20px;border-radius:8px;font-size:15px;font-weight:600;">
                    ${escapeHtml(cta.label)}
                  </a>
                </td></tr>`
              : '<tr><td style="padding:0 28px 20px;"></td></tr>'
          }
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid ${T.line};background:${T.surface2};
                       font-size:12px;line-height:1.5;color:${T.muted};">
              ${footerNote ? `<p style="margin:0 0 6px;">${escapeHtml(footerNote)}</p>` : ''}
              <p style="margin:0;">Este es un correo automático; no respondas a esta dirección.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
