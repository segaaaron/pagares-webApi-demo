import { Global, Module } from '@nestjs/common';
import { MAILER } from './domain/ports/mailer.js';
import { ResendMailer } from './infrastructure/resend.mailer.js';
import { RecordingMailer } from './infrastructure/recording.mailer.js';
import { ApnsChannel } from './infrastructure/apns.channel.js';
import { PUSH_CHANNEL } from './domain/ports/notification-channel.js';
import { DispatchPendingService } from './application/dispatch-pending.service.js';
import { SendNoteDocumentUseCase } from './application/send-note-document.use-case.js';
import { NoteMailController } from './note-mail.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { ListNotificationsUseCase } from './application/list-notifications.use-case.js';
import { RetryNotificationUseCase } from './application/retry-notification.use-case.js';
import { WebhooksController } from './webhooks.controller.js';
import { DocumentsModule } from '../documents/documents.module.js';

/**
 * Entrega de mensajes (§16, §18.1). Decide **cómo** se manda, nunca qué se
 * manda: eso lo dicen los eventos de los demás módulos.
 *
 * Importa `DocumentsModule` por su puerto `NOTE_DOCUMENTS`: los correos 6, 15 y
 * 17 llevan el PDF adjunto y hace falta quien lo dibuje.
 */
@Global()
@Module({
  imports: [DocumentsModule],
  controllers: [NoteMailController, NotificationsController, WebhooksController],
  providers: [
    ResendMailer,
    // El puerto lo sirve el decorador que anota cada envío; `ResendMailer` es
    // quien habla con el proveedor y queda detrás (§16).
    { provide: MAILER, useClass: RecordingMailer },
    { provide: PUSH_CHANNEL, useClass: ApnsChannel },
    DispatchPendingService,
    SendNoteDocumentUseCase,
    ListNotificationsUseCase,
    RetryNotificationUseCase,
  ],
  exports: [MAILER, PUSH_CHANNEL, DispatchPendingService, ListNotificationsUseCase],
})
export class NotificationsModule {}
