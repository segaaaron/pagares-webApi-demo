import { Body, Controller, HttpCode, Post, Req, UseInterceptors } from '@nestjs/common';
import { importRequestSchema, type ImportRequest } from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { ImportDebtorsUseCase } from './application/import-debtors.use-case.js';

/**
 * Importación inicial de deudores (§24.5).
 *
 * Con `commit: false` sólo valida y devuelve los conflictos; con `commit: true`
 * escribe, y exige `Idempotency-Key` porque un reintento de red no puede
 * duplicar media cartera (§12.4).
 */
@Controller({ path: 'admin/imports', version: '1' })
@Roles('ADMIN')
export class DebtorImportsController {
  constructor(private readonly importDebtors: ImportDebtorsUseCase) {}

  @Post('debtors')
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  async debtors(
    @Body(new ZodValidationPipe(importRequestSchema)) body: ImportRequest,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.importDebtors.execute(
      { csv: body.csv, commit: body.commit },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }
}
