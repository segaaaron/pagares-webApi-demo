import { T, escapeHtml } from './tokens.js';

export interface DocumentCardData {
  folio: string;
  amountFormatted: string;
  amountInWords: string;
  balanceFormatted?: string;
  dueDateFormatted: string;
  creditorName: string;
  statusLabel: string;
  statusTone?: 'neutral' | 'warn' | 'crit' | 'ok';
}

/**
 * Tarjeta-documento: el elemento central de casi todos los correos.
 * Replica el pagaré —folio, importe en número y letra, vencimiento— para que el
 * deudor reconozca de qué documento se le habla sin abrir nada.
 */
export function documentCard(data: DocumentCardData): string {
  const tones = {
    neutral: { bg: T.surface2, fg: T.ink2 },
    warn: { bg: T.warnSoft, fg: T.warn },
    crit: { bg: T.critSoft, fg: T.crit },
    ok: { bg: T.accentSoft, fg: T.accentInk },
  } as const;
  const tone = tones[data.statusTone ?? 'neutral'];

  const row = (label: string, value: string, mono = false): string =>
    `<tr>
      <td style="padding:6px 0;font-size:12px;color:${T.muted};width:38%;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;font-size:14px;color:${T.ink};${mono ? `font-family:${T.mono};font-variant-numeric:tabular-nums;` : ''}">${escapeHtml(value)}</td>
    </tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="border:1px solid ${T.line};border-radius:10px;margin:8px 0 20px;">
    <tr>
      <td style="padding:16px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-family:${T.mono};font-size:13px;color:${T.accentInk};">${escapeHtml(data.folio)}</td>
            <td align="right">
              <span style="display:inline-block;padding:3px 9px;border-radius:5px;font-size:11px;
                           background:${tone.bg};color:${tone.fg};">${escapeHtml(data.statusLabel)}</span>
            </td>
          </tr>
        </table>
        <p style="margin:12px 0 2px;font-family:${T.serif};font-size:26px;font-weight:600;color:${T.ink};
                  font-variant-numeric:tabular-nums;">${escapeHtml(data.amountFormatted)}</p>
        <p style="margin:0 0 14px;font-size:12px;color:${T.muted};">${escapeHtml(data.amountInWords)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${data.balanceFormatted ? row('Saldo pendiente', data.balanceFormatted, true) : ''}
          ${row('Vence el', data.dueDateFormatted)}
          ${row('A favor de', data.creditorName)}
        </table>
      </td>
    </tr>
  </table>`;
}
