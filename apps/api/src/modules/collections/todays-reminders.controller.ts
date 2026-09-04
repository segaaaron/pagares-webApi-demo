import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { DispatchPendingService } from '../notifications/application/dispatch-pending.service.js';
import {
  SendTodaysRemindersUseCase,
  TodaysRemindersUseCase,
} from './application/todays-reminders.use-case.js';

/**
 * Los avisos del día, juntos (§13.1, §18).
 *
 * Dos rutas y no una: primero se ve a quién le va a llegar y luego se manda.
 * Un botón que envía treinta correos sin enseñar antes la lista es un botón que
 * nadie pulsa dos veces con tranquilidad.
 */
@Controller({ path: 'admin/reminders', version: '1' })
@Roles('ADMIN')
export class TodaysRemindersController {
  constructor(
    private readonly todays: TodaysRemindersUseCase,
    private readonly send: SendTodaysRemindersUseCase,
    private readonly dispatcher: DispatchPendingService,
  ) {}

  /** Qué se mandaría hoy. No escribe nada: es una pregunta. */
  @Get('today')
  async preview(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    return this.todays.execute({}, this.contextOf(actor, request));
  }

  @Post('today')
  @HttpCode(200)
  async run(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    const resultado = await this.send.execute({}, this.contextOf(actor, request));
    // Los correos salen al confirmar, como el resto (§18.1).
    await this.dispatcher.dispatchPending();
    return resultado;
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
