/**
 * La bitácora en español.
 *
 * El servidor guarda la acción como un código —`user.access_deleted`— porque es
 * lo que se puede filtrar y comparar sin ambigüedad. Enseñárselo tal cual al
 * administrador convierte el registro en un volcado de máquina: nadie va a
 * auditar nada que no puede leer. Aquí se traduce a una frase, y se marca
 * aparte lo que no es rutina sino aviso de seguridad.
 */
export type AuditTone = 'normal' | 'atencion';

export interface AuditLabel {
  readonly text: string;
  readonly tone: AuditTone;
  /** Qué hacer si esto no debería haber pasado. Sólo donde hay algo que hacer. */
  readonly hint?: string;
}

const LABELS: Record<string, AuditLabel> = {
  // Seguridad: esto no es actividad normal y no debe leerse como tal.
  'auth.refresh_reused': {
    text: 'Se reutilizó un token de sesión ya gastado',
    tone: 'atencion',
    hint: 'Puede ser una app que reintentó, o alguien usando una sesión robada. Se cerraron las sesiones de esa cuenta.',
  },
  'auth.locked': {
    text: 'Cuenta bloqueada por intentos fallidos',
    tone: 'atencion',
    hint: 'Se desbloquea desde Accesos. Si no fue el titular, cámbiale la contraseña.',
  },

  'note.issue': { text: 'Se emitió un pagaré', tone: 'normal' },
  'note.sign': { text: 'Se firmó un pagaré', tone: 'normal' },
  'note.void': {
    text: 'Se anuló un pagaré',
    tone: 'atencion',
    hint: 'El pagaré no se borra: queda anulado con motivo y actor. Si no lo anulaste tú, ábrelo y mira quién y por qué.',
  },
  'note.write_off': {
    text: 'Se dio un pagaré de baja contable',
    tone: 'atencion',
    hint: 'Deja de contar como cartera, pero la deuda sigue viva y se puede recuperar. Es reversible desde el propio pagaré.',
  },
  'note.renew': { text: 'Se renovó un pagaré', tone: 'normal' },
  'note.extend': { text: 'Se prorrogó el vencimiento', tone: 'normal' },
  'note.reminder': { text: 'Se mandó un recordatorio', tone: 'normal' },
  'note.legal_package': { text: 'Se generó el paquete legal', tone: 'normal' },
  'note.recalculate_balance': {
    text: 'Se recalculó el saldo contra el libro de abonos',
    tone: 'atencion',
    hint: 'Sólo debería ocurrir tras un descuadre. Si nadie lo pidió, revisa el cuadre de saldos.',
  },
  'notes.import': { text: 'Se importaron pagarés', tone: 'normal' },
  'debtors.import': { text: 'Se importaron deudores', tone: 'normal' },

  'payment.register': { text: 'Se registró un abono', tone: 'normal' },
  'payment.void': {
    text: 'Se anuló un abono',
    tone: 'atencion',
    hint: 'El abono no se borra: queda anulado con motivo. Compruébalo en el pagaré.',
  },
  'settlement.create': { text: 'Se creó un convenio de pago', tone: 'normal' },

  void: { text: 'Se anuló un pagaré', tone: 'atencion' },
  'write-off': { text: 'Se dio un pagaré de baja contable', tone: 'atencion' },
  reinstate: {
    text: 'Se revirtió una baja contable',
    tone: 'atencion',
    hint: 'El pagaré vuelve a contar como cartera. Debería coincidir con un cobro o un acuerdo.',
  },

  'user.create': { text: 'Se creó un acceso', tone: 'normal' },
  'user.access_deleted': {
    text: 'Se borró un acceso',
    tone: 'atencion',
    hint: 'El deudor y sus pagarés siguen en el sistema. El acceso se vuelve a dar desde su ficha.',
  },
  'user.reset_password': {
    text: 'Se restableció una contraseña',
    tone: 'atencion',
    hint: 'Quien lo hizo pudo entrar a esa cuenta con la contraseña temporal. Si no lo pediste tú, cámbiala otra vez y revisa sus sesiones.',
  },
  'user.suspend': {
    text: 'Se suspendió un acceso',
    tone: 'atencion',
    hint: 'El deudor no puede entrar hasta que se reactive desde Accesos. Sus pagarés no cambian.',
  },
  'user.unsuspend': { text: 'Se reactivó un acceso', tone: 'normal' },
  'user.unlock': { text: 'Se desbloqueó un acceso', tone: 'normal' },
  'user.reset-password': {
    text: 'Se restableció una contraseña',
    tone: 'atencion',
    hint: 'Quien lo hizo pudo entrar a esa cuenta con la contraseña temporal. Si no lo pediste tú, cámbiala otra vez y revisa sus sesiones.',
  },

  'password.initial': { text: 'Se estrenó una contraseña', tone: 'normal' },
  'password.change': { text: 'Alguien cambió su contraseña', tone: 'normal' },
  'password.reset': {
    text: 'Se recuperó una contraseña con código',
    tone: 'atencion',
    hint: 'El código llegó a su correo. Si el titular no lo pidió, alguien tiene acceso a ese buzón.',
  },

  'reminder_rules.replace': { text: 'Se cambiaron las reglas de aviso', tone: 'normal' },
  'legal.open_case': { text: 'Se abrió expediente judicial', tone: 'normal' },
  'legal.custody': { text: 'Se anotó dónde está el pagaré en papel', tone: 'normal' },
};

const DOCUMENTOS: Record<string, string> = {
  note: 'el pagaré',
  receipt: 'un recibo',
  statement: 'el estado de cuenta',
  'legal-package': 'el paquete legal',
};

/**
 * La frase de una entrada. Un código que no esté en la tabla no se oculta ni se
 * disfraza: se enseña como está, que es mejor que decir "otra acción".
 */
export function auditLabel(action: string): AuditLabel {
  const known = LABELS[action];
  if (known) return known;

  // `note.send_email.<documento>` se compone en el servidor, así que aquí no hay
  // una fila por documento sino una regla.
  const email = action.startsWith('note.send_email.') ? action.slice('note.send_email.'.length) : null;
  if (email !== null) {
    return { text: `Se mandó por correo ${DOCUMENTOS[email] ?? email}`, tone: 'normal' };
  }

  return { text: action, tone: 'normal' };
}

/** Lo que la entrada tocó, sacado de su metadato sin confiar en su forma. */
export interface AuditSubject {
  /** Importe en centavos, cuando el movimiento es de dinero. */
  amountCents?: string;
  folio?: string;
  /** El pagaré al que apunta, para poder abrirlo desde aquí. */
  noteId?: string;
}

/**
 * Sobre qué fue la acción.
 *
 * Sin esto la bitácora decía «Se registró un abono» y nada más, así que no
 * podía contestar justo la pregunta para la que existe: *¿quién anuló **ese**
 * abono?*. El importe y el folio están guardados desde el principio; sólo no se
 * enseñaban.
 */
export function auditSubject(entry: {
  targetType: string;
  targetId?: string;
  metadata: unknown;
}): AuditSubject {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const texto = (valor: unknown): string | undefined =>
    typeof valor === 'string' && valor.length > 0 ? valor : undefined;

  const subject: AuditSubject = {};
  const importe = texto(meta['amountCents']);
  if (importe !== undefined && /^-?\d+$/.test(importe)) subject.amountCents = importe;

  const folio = texto(meta['folio']) ?? texto(meta['newFolio']);
  if (folio !== undefined) subject.folio = folio;

  // El identificador del pagaré es el del propio registro cuando la acción va
  // contra un título: es lo que permite abrirlo desde la bitácora.
  if (entry.targetType === 'PromissoryNote') {
    const id = texto(entry.targetId);
    if (id !== undefined) subject.noteId = id;
  }

  return subject;
}
