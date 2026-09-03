import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import type { Mailer, MailMessage } from '../domain/ports/mailer.js';
import { ResendMailer } from './resend.mailer.js';

/**
 * Decorador del puerto `Mailer` que **anota cada envío**.
 *
 * Va en un decorador y no dentro de `ResendMailer` porque son dos
 * responsabilidades: una habla con el proveedor, la otra lleva el registro. Así
 * el día que se cambie de proveedor, el historial de entregas no se toca.
 *
 * Un fallo al escribir la fila **no** tumba el envío: el correo ya salió, y
 * perder su registro es malo pero mentir diciendo que no salió es peor.
 */
@Injectable()
export class RecordingMailer implements Mailer {
  private readonly logger = new Logger(RecordingMailer.name);

  constructor(
    private readonly inner: ResendMailer,
    private readonly prisma: PrismaService,
  ) {}

  async send(message: MailMessage): Promise<{ messageId: string }> {
    try {
      const result = await this.inner.send(message);
      await this.record(message, result.messageId, null);
      return result;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // El fallo también se anota: un correo que no salió es lo que hay que ver
      // en el detalle del pagaré, no un hueco (§18.1).
      await this.record(message, `failed:${randomUUID()}`, reason);
      throw error;
    }
  }

  private async record(
    message: MailMessage,
    messageId: string,
    error: string | null,
  ): Promise<void> {
    try {
      await this.prisma.emailDelivery.create({
        data: {
          messageId,
          to: message.to,
          subject: message.subject,
          templateId: message.meta?.templateId ?? null,
          noteId: message.meta?.noteId ?? null,
          userId: message.meta?.userId ?? null,
          status: error ? 'FAILED' : 'SENT',
          error,
        },
      });
    } catch (failure) {
      this.logger.warn({
        messageId,
        reason: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }
}
