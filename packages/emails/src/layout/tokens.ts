/**
 * Identidad visual del correo (§16). Hereda la del producto: no son plantillas
 * genéricas. Todo se declara aquí una vez y se usa en línea, porque los clientes
 * de correo ignoran las hojas de estilo externas.
 */
export const T = {
  paper: '#F2F5F2',
  surface: '#FFFFFF',
  surface2: '#E8EDE9',
  ink: '#121B17',
  ink2: '#39473F',
  muted: '#6A7A71',
  line: '#D2DAD4',
  accent: '#0E6B52',
  accentInk: '#0B5340',
  accentSoft: '#DDEDE5',
  crit: '#9B3324',
  critSoft: '#F6E0DC',
  warn: '#8A5A12',
  warnSoft: '#F4E9D4',
  sans: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  serif: "Spectral, Georgia, 'Times New Roman', serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  width: 600,
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
