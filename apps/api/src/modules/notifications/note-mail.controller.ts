import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { SendNoteDocumentUseCase } from './application/send-note-document.use-case.js';

const sendEmailSchema = z
  .object({
    document: z.enum(['note', 'receipt', 'statement', 'release']),
    /** Obligatorio para el recibo: dice de qué abono. */
    paymentId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Envío a demanda de los documentos del pagaré (§15).
 *
 * Vive en `notifications` porque quien manda correo es este módulo; los PDFs
 * llegan por el puerto `NOTE_DOCUMENTS`, sin que nadie tenga que conocer el
 * interior del módulo de documentos (§3.2).
 */
@Controller({ path: 'admin/notes', version: '1' })
@Roles('ADMIN')
export class NoteMailController {
  constructor(private readonly sendDocument: SendNoteDocumentUseCase) {}

  @Post(':id/send-email')
  @HttpCode(200)
  async send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendEmailSchema)) body: z.infer<typeof sendEmailSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.sendDocument.execute(
      {
        noteId: id,
        document: body.document,
        ...(body.paymentId !== undefined ? { paymentId: body.paymentId } : {}),
      },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }
}
