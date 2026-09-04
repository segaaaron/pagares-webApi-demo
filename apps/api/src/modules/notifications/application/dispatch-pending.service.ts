import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  adminResetPassword,
  extensionRegistered,
  noteSettled,
  noteSigned,
  noteToSign,
  noteVoided,
  otpCode,
  passwordChanged,
  paymentRegistered,
  renderReminder,
  securityAlert,
  settlementBroken,
  settlementCreated,
  welcomeCredentials,
  type DocumentCardData,
} from '@pagares/emails';
import { daysOverdue, formatMxn } from '@pagares/domain-rules';
import { CLOCK, type Clock } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { MAILER, type Mailer } from '../domain/ports/mailer.js';
import { NOTE_DOCUMENTS, type NoteDocuments } from '../../../shared/domain/note-documents.port.js';
import { PUSH_CHANNEL, type NotificationChannel } from '../domain/ports/notification-channel.js';
import { ENV } from '../../../config/config.module.js';
import { withClock } from '../../promissory-notes/domain/note-status.js';
import type { Env } from '../../../config/env.schema.js';
// El tope de intentos vive en el dominio: el panel lo necesita para enseñar lo
// que se atascó, y dos copias del número se desincronizan.
import { MAX_ATTEMPTS } from '../domain/outbox-state.js';



/** Los avisos que además viajan como push (§24.3). */
const PUSHABLE = new Set(['issued', 'reminder', 'payment', 'settled']);

/**
 * Del tipo interno de aviso al identificador del catálogo de §16.
 *
 * El registro de entregas se consulta para contestar "¿le llegó el correo 15?",
 * así que tiene que guardar el id del catálogo y no el nombre que use este
 * archivo por dentro.
 */
const TEMPLATE_BY_KIND: Record<string, string> = {
  issued: 'note-to-sign',
  signed: 'note-signed-receipt',
  payment: 'payment-registered',
  settled: 'note-settled',
  voided: 'note-voided',
  extended: 'extension-registered',
  settlement: 'settlement-created',
  'settlement-broken': 'settlement-broken',
};

/**
 * Envío de las notificaciones pendientes.
 *
 * No hay cola ni proceso aparte: la operación guarda el aviso en la misma
 * transacción que el cambio, y en cuanto ésta confirma se intenta enviar. Si el
 * envío falla, la fila queda pendiente con su error y el dashboard permite
 * reenviarla; nada se pierde en silencio y nada se dispara solo.
 */
@Injectable()
export class DispatchPendingService {
  private readonly logger = new Logger(DispatchPendingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(NOTE_DOCUMENTS) private readonly documents: NoteDocuments,
    @Inject(PUSH_CHANNEL) private readonly push: NotificationChannel,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Procesa los avisos pendientes. Se llama tras confirmar una operación. */
  async dispatchPending(): Promise<void> {
    const pending = await this.prisma.outboxMessage.findMany({
      where: { publishedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const message of pending) {
      try {
        await this.handle(message.eventType, message.payload as Record<string, unknown>);
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: { publishedAt: this.clock.now(), attempts: { increment: 1 } },
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error({ outboxId: message.id, eventType: message.eventType, reason });
        await this.prisma.outboxMessage.update({
          where: { id: message.id },
          data: { attempts: { increment: 1 }, lastError: reason },
        });
        await this.markReminderFailed(message.eventType, message.payload, reason);
      }
    }
  }

  /**
   * Un recordatorio que no salió se anota como fallido.
   *
   * Sin esto, la fila se quedaba en `QUEUED` para siempre y su clave única
   * `(pagaré, regla, día)` impedía volver a intentarlo ese día: un fallo de
   * correo dejaba al deudor sin aviso y al administrador sin manera de
   * reenviarlo (§13.1).
   */
  private async markReminderFailed(
    eventType: string,
    payload: unknown,
    reason: string,
  ): Promise<void> {
    if (eventType !== 'NoteReminderRequested') return;

    const data = payload as { noteId?: string; ruleId?: string };
    if (!data.noteId || !data.ruleId) return;

    await this.prisma.reminderLog
      .updateMany({
        where: { noteId: data.noteId, ruleId: data.ruleId, status: 'QUEUED' },
        data: { status: 'FAILED', error: reason.slice(0, 500) },
      })
      .catch(() => undefined);
  }

  private async handle(eventType: string, payload: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'UserCreated':
        await this.sendWelcome(payload);
        return;
      case 'PasswordReset':
        await this.sendAdminReset(payload);
        return;
      case 'AccountLocked':
      case 'RefreshReused':
        await this.sendSecurityAlert(eventType, payload);
        return;
      case 'OtpIssued':
        await this.sendOtp(payload);
        return;
      case 'PasswordChanged':
        await this.sendPasswordChanged(payload);
        return;
      case 'NoteIssued':
        await this.sendNoteEmail(payload, 'issued');
        return;
      case 'NoteReminderRequested':
        await this.sendNoteEmail(payload, 'reminder');
        return;
      case 'NoteSigned':
        await this.sendNoteEmail(payload, 'signed');
        return;
      case 'NoteSettled':
        await this.sendNoteEmail(payload, 'settled');
        return;
      case 'NoteVoided':
        await this.sendNoteEmail(payload, 'voided');
        return;
      case 'NoteExtended':
        await this.sendNoteEmail(payload, 'extended');
        return;
      case 'PaymentRegistered':
        await this.sendNoteEmail(payload, 'payment');
        return;
      case 'SettlementCreated':
        await this.sendNoteEmail(payload, 'settlement');
        return;
      case 'SettlementBroken':
        await this.sendNoteEmail(payload, 'settlement-broken');
        return;
      default:
        // Un evento sin destinatario de correo no es un error.
        return;
    }
  }

  /**
   * Correos ligados a un pagaré. Todos comparten la tarjeta-documento, así que se
   * arma una vez y cada plantilla decide qué decir alrededor.
   *
   * Un pagaré sin cuenta de cliente no tiene destinatario: se marca como enviado
   * para no reintentar en balde, y la gestión queda en la bandeja de Hoy (§25.12).
   */
  private async sendNoteEmail(payload: Record<string, unknown>, kind: string): Promise<void> {
    const noteId = String(payload['noteId']);
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: noteId },
      include: { debtor: true, owner: true },
    });
    if (!note) return;

    const to = note.debtor.email ?? note.owner?.email;
    if (!to) return; // sin correo no hay envío automático; se gestiona a mano

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const organizationName = settings?.legalName ?? note.creditorName;
    const appUrl = this.env.WEB_URL;
    const balance = note.amountCents - note.paidCents;
    // El correo dice lo mismo que el dashboard: el estado se deriva del reloj (§11.2).
    const status = withClock(
      note.status,
      daysOverdue(note.dueDate.toISOString().slice(0, 10), this.clock.now()),
    );

    const document: DocumentCardData = {
      folio: note.folio,
      amountFormatted: formatMxn(note.amountCents),
      amountInWords: note.amountInWords,
      balanceFormatted: formatMxn(balance),
      dueDateFormatted: this.formatDate(note.dueDate),
      creditorName: note.creditorName,
      statusLabel: this.statusLabel(status),
      statusTone: status === 'OVERDUE' ? 'crit' : status === 'PAID' ? 'ok' : 'neutral',
    };

    const common = { organizationName, fullName: note.debtor.fullName, document, appUrl };

    /*
     * Cómo pagar, dentro del propio recordatorio. Los datos bancarios viven en
     * Ajustes y hasta ahora sólo los veía la aplicación del cliente: quien
     * recibía el correo tenía que buscarlos por su cuenta.
     */
    const paymentInstructions = settings?.bankClabe
      ? [
          settings.bankName ? `Banco: ${settings.bankName}` : null,
          settings.bankAccount ? `Cuenta: ${settings.bankAccount}` : null,
          `CLABE: ${settings.bankClabe}`,
          // El folio, como concepto de la transferencia: es lo único que permite
          // saber a qué pagaré aplicar el depósito, y es lo mismo que enseña la
          // aplicación del cliente. Dos versiones distintas acaban en llamada.
          `Concepto: ${note.folio}`,
          settings.paymentReference ? `Referencia de la empresa: ${settings.paymentReference}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;

    const mail =
      kind === 'reminder'
        ? // La plantilla la eligió la regla del tramo (§13.1); aquí sólo se pinta.
          renderReminder(String(payload['templateId'] ?? 'due-reminder'), {
            ...common,
            offsetDays: Number(payload['offsetDays'] ?? 0),
            ...(paymentInstructions !== undefined ? { paymentInstructions } : {}),
          })
        : kind === 'issued'
        ? noteToSign({
            ...common,
            hasAccount: note.ownerId !== null,
            // Una deuda a plazos manda un solo aviso por toda la serie (§12).
            ...(payload['installments'] ? { installments: Number(payload['installments']) } : {}),
          })
        : kind === 'signed'
          ? noteSigned({ ...common, signedAtFormatted: this.formatDate(note.acceptedAt ?? this.clock.now()) })
          : kind === 'settled'
            ? noteSettled(common)
            : kind === 'voided'
              ? noteVoided({ ...common, reason: note.voidReason ?? 'Sin motivo registrado' })
              : kind === 'extended'
                ? extensionRegistered({
                    ...common,
                    previousDueFormatted: this.formatDate(new Date(String(payload['previousDue']))),
                    newDueFormatted: this.formatDate(new Date(String(payload['newDue']))),
                    reason: 'Acuerdo con el cliente',
                  })
                : kind === 'settlement'
                  ? settlementCreated({
                      ...common,
                      agreedFormatted: formatMxn(BigInt(String(payload['agreedCents'] ?? '0'))),
                      forgivenFormatted: formatMxn(BigInt(String(payload['forgivenCents'] ?? '0'))),
                      dueOnFormatted: this.formatDate(new Date(String(payload['dueOn']))),
                      terms: null,
                    })
                  : kind === 'settlement-broken'
                    ? settlementBroken(common)
                    : paymentRegistered({
                        ...common,
                        amountPaidFormatted: formatMxn(BigInt(String(payload['amountCents'] ?? '0'))),
                        paidOnFormatted: this.formatDate(this.clock.now()),
                        methodLabel: 'Registrado por el administrador',
                        isSettled: balance <= 0n,
                      });

    /*
     * Los correos 6, 15 y 17 (§16) llevan el documento adjunto. Se adjunta aquí y
     * no en cada plantilla porque el PDF se genera al momento (§17.1) y un fallo
     * al dibujarlo no debe impedir el aviso: se manda sin adjunto y queda el
     * error en el log, que es más útil que un pagaré firmado del que nadie se
     * enteró.
     */
    const attachments = await this.attachmentsFor(kind, note.id, payload).catch((error: unknown) => {
      this.logger.warn({
        noteId: note.id,
        kind,
        reason: error instanceof Error ? error.message : String(error),
      });
      return [];
    });

    const sent = await this.mailer.send({
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(attachments.length > 0 ? { attachments } : {}),
      meta: {
        templateId:
          kind === 'reminder'
            ? String(payload['templateId'] ?? 'due-reminder')
            : (TEMPLATE_BY_KIND[kind] ?? kind),
        noteId: note.id,
        ...(note.ownerId ? { userId: note.ownerId } : {}),
      },
    });

    // El recordatorio deja rastro de su entrega: sin esto, "¿le llegó?" sólo se
    // contesta abriendo el panel de Resend (§13.1).
    if (kind === 'reminder' && payload['ruleId']) {
      await this.prisma.reminderLog.updateMany({
        where: { noteId: note.id, ruleId: String(payload['ruleId']), status: 'QUEUED' },
        data: { status: 'SENT', messageId: sent.messageId },
      });
    }

    // El push dice **lo mismo** que el correo, y sólo para los avisos que el
    // deudor necesita ahora: por firmar, vencimiento, abono y liquidación
    // (§24.3). Un canal con contenido propio acaba contradiciendo al otro.
    if (PUSHABLE.has(kind) && note.ownerId) {
      await this.mirrorPush(note.ownerId, mail.subject, this.plainFirstLine(mail.text), note.id);
    }
  }

  /**
   * Manda el mismo aviso a los dispositivos del usuario.
   *
   * Un token caducado se borra en cuanto APNs lo dice: guardarlo sólo garantiza
   * volver a intentarlo y volver a fallar en cada aviso (§24.3).
   */
  private async mirrorPush(
    userId: string,
    title: string,
    body: string,
    noteId?: string | undefined,
  ): Promise<void> {
    if (!this.push.enabled) return;

    const devices = await this.prisma.deviceToken.findMany({ where: { userId } });
    for (const device of devices) {
      const result = await this.push.send({
        token: device.token,
        title,
        body,
        ...(noteId ? { data: { noteId } } : {}),
      });
      if (result.expired) {
        await this.prisma.deviceToken.delete({ where: { token: device.token } }).catch(() => undefined);
      }
    }
  }

  /** El cuerpo del push es una línea: el correo lleva el detalle. */
  private plainFirstLine(text: string): string {
    const line = text
      .split('\n')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && !value.startsWith('Hola'))[0];
    return (line ?? '').slice(0, 160);
  }

  /** Qué PDF acompaña a cada aviso (§17.1). */
  private async attachmentsFor(
    kind: string,
    noteId: string,
    payload: Record<string, unknown>,
  ): Promise<{ filename: string; content: Buffer }[]> {
    if (kind === 'signed') return [await this.documents.note(noteId)];
    if (kind === 'settled') return [await this.documents.release(noteId)];
    if (kind === 'payment' && payload['paymentId']) {
      return [await this.documents.receipt(String(payload['paymentId']))];
    }
    return [];
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(value);
  }

  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING_SIGNATURE: 'Por firmar',
      PROCESSING_SIGNATURE: 'Procesando',
      ISSUED: 'Vigente',
      PARTIALLY_PAID: 'Con abonos',
      OVERDUE: 'Vencido',
      PAID: 'Liquidado',
      RESTRUCTURED: 'En convenio',
      RENEWED: 'Renovado',
      WRITTEN_OFF: 'Castigado',
      VOID: 'Anulado',
    };
    return labels[status] ?? status;
  }

  private async sendOtp(payload: Record<string, unknown>): Promise<void> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const mail = otpCode({
      organizationName: settings?.legalName ?? 'Pagarés',
      fullName: String(payload['fullName']),
      code: String(payload['code']),
      expiresInMinutes: 10,
      purpose: payload['purpose'] === 'reset' ? 'reset' : 'change',
      requestedFromIp: payload['ip'] === null ? undefined : String(payload['ip']),
    });
    await this.mailer.send({
      to: String(payload['email']),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      meta: {
        templateId: payload['purpose'] === 'reset' ? 'otp-password-reset' : 'otp-password-change',
        userId: String(payload['userId']),
      },
    });
  }

  private async sendPasswordChanged(payload: Record<string, unknown>): Promise<void> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const mail = passwordChanged({
      organizationName: settings?.legalName ?? 'Pagarés',
      fullName: String(payload['fullName']),
      changedAtFormatted: new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Mexico_City',
      }).format(this.clock.now()),
      byAdmin: false,
    });
    await this.mailer.send({
      to: String(payload['email']),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      meta: { templateId: 'password-changed', userId: String(payload['userId']) },
    });
  }

  /**
   * Correo 5 (§16): el administrador restableció la contraseña.
   *
   * No reutiliza la bienvenida: quien recibe esto ya tenía cuenta y no pidió
   * nada, así que necesita saber quién lo hizo.
   */
  private async sendAdminReset(payload: Record<string, unknown>): Promise<void> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const expiresAt = String(payload['expiresAt']);
    const hours = Math.max(
      1,
      Math.round((Date.parse(expiresAt) - this.clock.now().getTime()) / 3_600_000),
    );

    const by = payload['resetById']
      ? await this.prisma.user.findUnique({
          where: { id: String(payload['resetById']) },
          select: { fullName: true },
        })
      : null;

    const mail = adminResetPassword({
      organizationName: settings?.legalName ?? 'Pagarés',
      fullName: String(payload['fullName']),
      temporaryPassword: String(payload['temporaryPassword']),
      expiresInHours: hours,
      appUrl: this.env.WEB_URL,
      byName: by?.fullName ?? 'Un administrador',
    });

    await this.mailer.send({
      to: String(payload['email']),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      meta: { templateId: 'admin-reset-password', userId: String(payload['userId']) },
    });
  }

  /**
   * Correo 13 (§16): alerta de seguridad.
   *
   * Es la contrapartida de bloquear por cuenta (§10.2): si un tercero puede
   * bloquear a alguien conociendo su correo, ese alguien tiene que enterarse.
   */
  private async sendSecurityAlert(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const user = await this.prisma.user.findUnique({
      where: { id: String(payload['userId']) },
      select: { email: true, fullName: true },
    });
    if (!user) return;

    const mail = securityAlert({
      organizationName: settings?.legalName ?? 'Pagarés',
      fullName: user.fullName,
      event: eventType === 'AccountLocked' ? 'account-locked' : 'refresh-reused',
      atFormatted: new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'America/Mexico_City',
      }).format(this.clock.now()),
      ...(payload['ip'] ? { ip: String(payload['ip']) } : {}),
      ...(payload['lockoutHours'] ? { lockoutHours: Number(payload['lockoutHours']) } : {}),
      resetUrl: `${this.env.WEB_URL}/login/recuperar`,
    });

    await this.mailer.send({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      meta: { templateId: 'security-alert', userId: String(payload['userId']) },
    });

    // La alerta de seguridad es el aviso que más urge ver: también va por push
    // y con el mismo texto (§24.3).
    await this.mirrorPush(String(payload['userId']), mail.subject, this.plainFirstLine(mail.text));
  }

  private async sendWelcome(payload: Record<string, unknown>): Promise<void> {
    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const expiresAt = String(payload['expiresAt']);
    const hours = Math.max(
      1,
      Math.round((Date.parse(expiresAt) - this.clock.now().getTime()) / 3_600_000),
    );

    const mail = welcomeCredentials({
      organizationName: settings?.legalName ?? 'Pagarés',
      fullName: String(payload['fullName']),
      email: String(payload['email']),
      temporaryPassword: String(payload['temporaryPassword']),
      expiresInHours: hours,
      appUrl: this.env.WEB_URL,
    });

    await this.mailer.send({
      to: String(payload['email']),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      meta: { templateId: 'welcome-credentials', userId: String(payload['userId']) },
    });
  }
}
