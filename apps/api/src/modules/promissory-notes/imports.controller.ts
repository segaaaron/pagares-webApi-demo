import { Body, Controller, HttpCode, Post, Req, UseInterceptors } from '@nestjs/common';
import { importRequestSchema, type ImportRequest } from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { ImportNotesUseCase } from './application/import-notes.use-case.js';

/**
 * Importación de pagarés existentes (§24.5). Los deudores van primero: un
 * pagaré sin deudor dado de alta no se puede colgar de nadie.
 */
@Controller({ path: 'admin/imports', version: '1' })
@Roles('ADMIN')
export class NoteImportsController {
  constructor(private readonly importNotes: ImportNotesUseCase) {}

  @Post('notes')
  @HttpCode(200)
  @UseInterceptors(IdempotencyInterceptor)
  async notes(
    @Body(new ZodValidationPipe(importRequestSchema)) body: ImportRequest,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.importNotes.execute(
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
