/**
 * Iconos de navegación, en SVG inline (§ diseño de Stitch).
 *
 * Sin librería de iconos: son ocho trazos y cargar un paquete entero para eso
 * añadiría peso al bundle sin aportar nada. `aria-hidden` porque la etiqueta de
 * texto ya nombra el destino; el icono es apoyo visual, no información.
 */
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const NavIcon = {
  panel: () => (
    <svg {...base}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  notes: () => (
    <svg {...base}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  portfolio: () => (
    <svg {...base}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  collections: () => (
    <svg {...base}>
      <path d="M3 4h18l-7 8v7l-4 2v-9z" />
    </svg>
  ),
  reports: () => (
    <svg {...base}>
      <path d="M4 4h16v16H4z" />
      <path d="M8 15v-3M12 15V9M16 15v-5" />
    </svg>
  ),
  clients: () => (
    <svg {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M18 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  ),
  users: () => (
    <svg {...base}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  ),
  settings: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  logout: () => (
    <svg {...base}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  document: () => (
    <svg {...base} width={32} height={32} strokeWidth={1.4}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  download: () => (
    <svg {...base} width={15} height={15}>
      <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
    </svg>
  ),
  chevronLeft: () => (
    <svg {...base} width={15} height={15}>
      <path d="m14 6-6 6 6 6" />
    </svg>
  ),
  chevronRight: () => (
    <svg {...base} width={15} height={15}>
      <path d="m10 6 6 6-6 6" />
    </svg>
  ),
  search: () => (
    <svg {...base} width={15} height={15}>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4 4" />
    </svg>
  ),
  clock: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  alert: () => (
    <svg {...base}>
      <path d="M12 8v5m0 3h.01" />
      <path d="M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
  check: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  /** Marca: un pagaré doblado. Vale como logotipo mientras no haya uno. */
  mark: () => (
    <svg {...base} width={17} height={17} strokeWidth={1.9}>
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4M8.5 12.5h7M8.5 16.5h4" />
    </svg>
  ),
  whatsapp: () => (
    <svg {...base} width={15} height={15}>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20.5l1.7-5.3A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M8.6 9.1c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.7 1.6c.1.3 0 .5-.1.7l-.4.4c-.1.2-.2.3 0 .6a6 6 0 0 0 2.6 2.2c.3.1.5 0 .6-.1l.5-.6c.2-.2.4-.2.6-.1l1.5.8c.3.1.4.3.4.5 0 .8-.6 1.5-1.4 1.6-.6 0-1.4 0-4-1.6a8 8 0 0 1-2.7-3.4c-.4-1-.3-1.9-.1-2.3l-.1-.3Z" />
    </svg>
  ),
  phone: () => (
    <svg {...base} width={15} height={15}>
      <path d="M6.5 3.5h3l1.5 4-2 1.2a12 12 0 0 0 5.3 5.3l1.2-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  ),
  inbox: () => (
    <svg {...base}>
      <path d="M4 13h4l1.5 3h5l1.5-3h4" />
      <path d="M5.5 5h13l1.5 8v4a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-4z" />
    </svg>
  ),
} as const;
