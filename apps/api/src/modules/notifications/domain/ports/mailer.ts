export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
  /**
   * Con qué tiene que ver este correo. No lo usa el envío: lo usa el registro
   * de entregas, para que el webhook del proveedor pueda contestar "¿le llegó
   * el aviso de este pagaré?" y no sólo "¿se entregó el mensaje X?" (§16).
   */
  meta?: {
    templateId?: string | undefined;
    noteId?: string | undefined;
    userId?: string | undefined;
  };
}

/** Puerto de correo (§16). Resend en el VPS, Mailpit en local. */
export interface Mailer {
  send(message: MailMessage): Promise<{ messageId: string }>;
}

export const MAILER = Symbol('Mailer');
