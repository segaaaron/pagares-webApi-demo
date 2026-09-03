import { Body, Controller, ForbiddenException, HttpCode, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PresignUploadUseCase } from './application/presign-upload.use-case.js';

const presignSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('presign'),
      profile: z.enum(['legal-exhibit', 'document-scan']),
      contentType: z.enum(['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'application/pdf']),
    })
    .strict(),
  z.object({ mode: z.literal('confirm'), key: z.string().min(8).max(200) }).strict(),
]);

/**
 * Subida directa de anexos grandes (§8.5).
 *
 * La firma **no** pasa por aquí: va por multipart en la misma petición que la
 * comprime (§8.4). Esto es para expedientes y escaneos, donde el binario no
 * tiene por qué atravesar la API.
 */
@Controller({ path: 'uploads', version: '1' })
@Roles('ADMIN', 'CLIENT')
export class UploadsController {
  constructor(private readonly presign: PresignUploadUseCase) {}

  @Post('presign')
  @HttpCode(200)
  async request(
    @Body(new ZodValidationPipe(presignSchema)) body: z.infer<typeof presignSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    // El expediente judicial es del acreedor: un cliente no sube pruebas a él
    // (§9.1, API5). Lo suyo son anexos de su propio trámite.
    if (actor.role !== 'ADMIN' && body.mode === 'presign' && body.profile === 'legal-exhibit') {
      throw new ForbiddenException('Ese perfil es sólo para la administración');
    }

    return this.presign.execute(body, {
      traceId: request.traceId ?? 'unknown',
      actorId: actor.id,
      actorRole: actor.role,
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    });
  }
}
