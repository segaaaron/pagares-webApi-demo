import { Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { DispatchPendingService } from '../notifications/application/dispatch-pending.service.js';
import { SendReminderUseCase } from './application/send-reminder.use-case.js';

/**
 * Recordatorio a petición del administrador (§18): no hay envíos solos.
 *
 * La ruta cuelga de `admin/notes` pero el caso de uso es de cobranza: quién
 * decide que toca avisar y con qué plantilla es §13.1, no el ciclo de vida del
 * pagaré. Tenerlo en el controlador de pagarés obligaba a ese módulo a importar
 * el caso de uso de otro, que es lo que prohíbe §3.2.
 */
@Controller({ path: 'admin/notes', version: '1' })
@Roles('ADMIN')
export class NoteRemindersController {
  constructor(
    private readonly reminders: SendReminderUseCase,
    private readonly dispatcher: DispatchPendingService,
  ) {}

  @Post(':id/reminders')
  async remind(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.reminders.execute(
      { noteId: id },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
    // El correo sale tras confirmar la transacción, como el resto (§18.1).
    await this.dispatcher.dispatchPending();
    return result;
  }
}
