import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { RecalculateBalanceUseCase } from './application/recalculate-balance.use-case.js';

/**
 * Recalcular el saldo de un pagaré desde su libro de abonos (§22.5).
 *
 * La ruta cuelga de `admin/notes` pero el caso de uso es de abonos: recalcular
 * el saldo es responsabilidad de `payments` (§3.1), y `reports` —donde se ve el
 * descuadre— es de sólo lectura y no puede escribir nada.
 */
@Controller({ path: 'admin/notes', version: '1' })
@Roles('ADMIN')
export class BalanceController {
  constructor(private readonly recalculate: RecalculateBalanceUseCase) {}

  @Post(':id/recalculate-balance')
  @HttpCode(200)
  async recalc(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.recalculate.execute(
      { noteId: id },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }
}
