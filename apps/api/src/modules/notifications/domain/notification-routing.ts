/**
 * Por dónde sale cada aviso (§16, ADR 0023).
 *
 * Esto era un `switch` de veinte casos dentro del despachador, y una política
 * enterrada en un `switch` no se puede comprobar: para saber si el abono seguía
 * mandando correo había que leer el archivo entero y creerse lo leído. Aquí es
 * una tabla con nombre, y su prueba la recorre completa.
 *
 * La regla del ADR 0023: **por correo sale el pagaré a firmar, y poco más**. Un
 * préstamo a plazos con abonos mandaba veinte correos por una sola deuda, y el
 * correo que se recibe veinte veces deja de leerse —incluido el único que exige
 * una acción—. Lo que pasa después se avisa en la aplicación, que además dice la
 * verdad de ahora y no la de cuando salió el correo.
 */

/** Cómo se atiende un evento. */
export type NotificationRoute =
  /** Correo de cuenta: credenciales, contraseña, seguridad. Los pide el usuario. */
  | { channel: 'ACCOUNT_EMAIL'; kind: 'welcome' | 'admin-reset' | 'otp' | 'password-changed' | 'security' }
  /** Correo sobre un pagaré. Sólo dos sobreviven al ADR 0023. */
  | { channel: 'NOTE_EMAIL'; kind: 'issued' | 'reminder' }
  /** Aviso en la aplicación y en ningún otro sitio. */
  | { channel: 'IN_APP'; kind: string }
  /** No se avisa de nada. */
  | { channel: 'SILENT' };

const SILENT: NotificationRoute = { channel: 'SILENT' };

/**
 * La tabla completa. Un evento que no esté aquí no genera aviso, y eso no es un
 * error: hay eventos que sólo existen para la bitácora y para otros módulos.
 */
const ROUTES: Record<string, NotificationRoute> = {
  // ── Cuenta y seguridad. No son avisos del pagaré: son acceso, y los provoca
  //    el propio usuario. Sin ellos nadie recupera su contraseña.
  UserCreated: { channel: 'ACCOUNT_EMAIL', kind: 'welcome' },
  PasswordReset: { channel: 'ACCOUNT_EMAIL', kind: 'admin-reset' },
  OtpIssued: { channel: 'ACCOUNT_EMAIL', kind: 'otp' },
  PasswordChanged: { channel: 'ACCOUNT_EMAIL', kind: 'password-changed' },
  AccountLocked: { channel: 'ACCOUNT_EMAIL', kind: 'security' },
  RefreshReused: { channel: 'ACCOUNT_EMAIL', kind: 'security' },

  // ── Los dos correos que quedan sobre un pagaré. El primero exige una acción
  //    y el deudor puede no tener la aplicación abierta; el segundo lo manda el
  //    administrador a propósito, contra un deudor concreto.
  NoteIssued: { channel: 'NOTE_EMAIL', kind: 'issued' },
  NoteReminderRequested: { channel: 'NOTE_EMAIL', kind: 'reminder' },

  // ── Lo que pasa después de emitir: aplicación y nada más.
  PaymentRegistered: { channel: 'IN_APP', kind: 'payment' },
  NoteSettled: { channel: 'IN_APP', kind: 'settled' },
  NoteVoided: { channel: 'IN_APP', kind: 'voided' },
  NoteExtended: { channel: 'IN_APP', kind: 'extended' },
  SettlementCreated: { channel: 'IN_APP', kind: 'settlement' },
  SettlementBroken: { channel: 'IN_APP', kind: 'settlement-broken' },

  // La firma no avisa de nada: el deudor acaba de firmarla y lo sabe.
  NoteSigned: SILENT,
};

export function routeFor(eventType: string): NotificationRoute {
  return ROUTES[eventType] ?? SILENT;
}

/**
 * Qué dice el aviso de la aplicación. Una línea, que es lo que cabe en una
 * notificación; el detalle lo cuenta la pantalla del pagaré, que está al día.
 */
const IN_APP_TITLE: Record<string, (folio: string) => string> = {
  payment: (folio) => `Abono registrado en tu pagaré ${folio}`,
  settled: (folio) => `Tu pagaré ${folio} quedó liquidado`,
  voided: (folio) => `Tu pagaré ${folio} fue anulado`,
  extended: (folio) => `Se registró una prórroga en tu pagaré ${folio}`,
  settlement: (folio) => `Tienes un convenio de pago en el pagaré ${folio}`,
  'settlement-broken': (folio) => `El convenio del pagaré ${folio} se dio por incumplido`,
};

export function inAppTitle(kind: string, folio: string): string | null {
  return IN_APP_TITLE[kind]?.(folio) ?? null;
}

/** Los eventos con ruta declarada. Sirve para que la prueba recorra la tabla entera. */
export function routedEvents(): string[] {
  return Object.keys(ROUTES);
}
