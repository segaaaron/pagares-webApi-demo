import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { ChangeCollectionStageUseCase } from './application/change-collection-stage.use-case.js';

const stageSchema = z
  .object({
    stage: z.enum(['PREVENTIVA', 'ADMINISTRATIVA', 'EXTRAJUDICIAL', 'JUDICIAL', 'CASTIGO']).optional(),
    /**
     * Congelada, la etapa deja de subir con el calendario. Es la herramienta
     * para el deudor que sí responde: sin ella acaba en judicial por la simple
     * acumulación de días (§13.2).
     */
    frozen: z.boolean().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((v) => v.stage !== undefined || v.frozen !== undefined, {
    message: 'Indica la etapa, el congelado, o ambos',
  });

/** Adelantar o congelar la etapa de gestión de un pagaré (§13.2). */
@Controller({ path: 'admin/notes/:noteId/collection-stage', version: '1' })
@Roles('ADMIN')
export class CollectionStageController {
  constructor(private readonly change: ChangeCollectionStageUseCase) {}

  @Patch()
  async update(
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(stageSchema)) body: z.infer<typeof stageSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.change.execute(
      { noteId, ...body },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
      },
    );
  }
}
