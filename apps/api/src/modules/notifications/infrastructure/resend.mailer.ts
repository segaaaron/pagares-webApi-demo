import { Inject, Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';
import type { Mailer, MailMessage } from '../domain/ports/mailer.js';

/**
 * Un solo adaptador con dos destinos: Resend en producción y SMTP (Mailpit) en
 * local. La elección se hace una vez aquí, no con condicionales repartidos.
 */
@Injectable()
export class ResendMailer implements Mailer {
  private readonly resend: Resend | null;
  private readonly smtp: Transporter | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.MAIL_DRIVER === 'resend') {
      if (!env.RESEND_API_KEY) throw new Error('MAIL_DRIVER=resend exige RESEND_API_KEY');
      this.resend = new Resend(env.RESEND_API_KEY);
      this.smtp = null;
    } else {
      this.resend = null;
      this.smtp = createTransport({ host: 'localhost', port: 1025, secure: false });
    }
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    if (this.resend) {
      const result = await this.resend.emails.send({
        from: this.env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.attachments ? { attachments: message.attachments } : {}),
      });
      if (result.error) throw new Error(`Resend rechazó el envío: ${result.error.message}`);
      return { messageId: result.data?.id ?? 'unknown' };
    }

    const info = await this.smtp!.sendMail({
      from: this.env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.attachments ? { attachments: message.attachments } : {}),
    });
    return { messageId: info.messageId };
  }
}
