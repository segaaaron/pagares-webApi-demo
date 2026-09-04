import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { ListNotificationsUseCase } from './application/list-notifications.use-case.js';
import { RetryNotificationUseCase } from './application/retry-notification.use-case.js';

/**
 * Avisos que no salieron, y cómo volver a intentarlo (§18.1).
 *
 * Sin estas dos rutas, un correo que agotaba sus intentos sólo se recuperaba
 * editando la base de datos a mano. El envío no tiene proceso aparte —ocurre al
 * cerrar cada operación—, así que un proveedor caído no rompe nada y por eso
 * mismo puede pasar inadvertido: esto es lo que lo hace visible.
 */
@Controller({ path: 'admin/notifications', version: '1' })
@Roles('ADMIN')
export class NotificationsController {
  constructor(
    private readonly list: ListNotificationsUseCase,
    private readonly retry: RetryNotificationUseCase,
  ) {}

  @Get()
  async pending(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    return this.list.execute({}, this.contextOf(actor, request));
  }

  /** Reintenta todos los atascados: el caso de «ya arreglé la causa». */
  @Post('retry')
  @HttpCode(200)
  async retryAll(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    return this.retry.execute({}, this.contextOf(actor, request));
  }

  @Post(':id/retry')
  @HttpCode(200)
  async retryOne(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.retry.execute({ id }, this.contextOf(actor, request));
  }

  private contextOf(actor: Actor, request: Request & { traceId?: string }) {
    return {
      traceId: request.traceId ?? 'unknown',
      actorId: actor.id,
      actorRole: actor.role,
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    };
  }
}
