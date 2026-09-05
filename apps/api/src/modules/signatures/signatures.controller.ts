import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import type { Request } from 'express';
import { CurrentActor, type Actor } from '../../shared/http/auth.guard.js';
import { SignNoteUseCase } from './application/sign-note.use-case.js';

/** Límite antes de leer el buffer completo: primera defensa del pipeline (§8.4). */
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024;
const MAX_VECTOR_BYTES = 1024 * 1024;

const captureSchema = z
  .object({
    capturedAt: z.string().datetime(),
    strokeCount: z.coerce.number().int().positive().optional(),
    durationMs: z.coerce.number().int().positive().optional(),
    inputType: z.enum(['pencil', 'finger']).optional(),
    /*
     * Si el aparato verificó al firmante antes de capturar el trazo —Face ID,
     * huella o el código del propio aparato—. Va en el mismo acto de firmar, y
     * es lo único que ataca la **atribución** desde el cliente: el trazo prueba
     * que alguien dibujó, no quién.
     *
     * Opcional a propósito, y nulo cuando el aparato no tiene biometría: no
     * afirmar nada es distinto de afirmar que falló.
     */
    /*
     * Booleano de verdad, sin convertir: `z.coerce.boolean()` volvía `true` la
     * cadena `"false"` —y `"0"`—, así que un cliente que dijera expresamente
     * que **no** hubo verificación acababa certificando que sí la hubo. En un
     * papel que va a un juzgado eso no es un fallo de tipos, es una falsedad.
     * Prefiero un 422 que lo delate.
     */
    biometricVerified: z.boolean().optional(),
    deviceModel: z.string().max(80).optional(),
    osVersion: z.string().max(40).optional(),
    appVersion: z.string().max(40).optional(),
    scrolledToEndAt: z.string().datetime().optional(),
    mode: z.enum(['REMOTE', 'IN_PERSON']).default('REMOTE'),
  })
  .strict();

interface UploadedSignature {
  signature?: Express.Multer.File[];
  signatureVector?: Express.Multer.File[];
}

@Controller({ path: 'notes', version: '1' })
export class SignaturesController {
  constructor(private readonly signNote: SignNoteUseCase) {}

  /**
   * Firma de un pagaré: la **única escritura** que puede hacer el cliente (§15).
   * Llegan dos partes —el PNG del trazo y el vector `.pkdrawing`— más los
   * metadatos de captura, que son los que convierten la imagen en evidencia.
   */
  @Post(':id/signature')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'signature', maxCount: 1 },
        { name: 'signatureVector', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_SIGNATURE_BYTES } },
    ),
  )
  async sign(
    @Param('id') noteId: string,
    @UploadedFiles() files: UploadedSignature,
    @Body('payload') rawPayload: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const png = files.signature?.[0];
    if (!png) throw new BadRequestException('Falta la imagen de la firma');

    const vector = files.signatureVector?.[0];
    if (vector && vector.size > MAX_VECTOR_BYTES) {
      throw new BadRequestException('El trazo vectorial supera el límite');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload ?? '{}');
    } catch {
      throw new BadRequestException('El campo payload no es JSON válido');
    }
    const capture = captureSchema.parse(parsed);

    return this.signNote.execute(
      {
        noteId,
        signaturePng: png.buffer,
        signatureVector: vector?.buffer,
        capture,
        mode: capture.mode,
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
