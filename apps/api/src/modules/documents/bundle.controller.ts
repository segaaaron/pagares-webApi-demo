import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { BundleNotesUseCase } from './application/bundle-notes.use-case.js';
import { ARCHIVE_BUILDER, type ArchiveBuilder } from './domain/ports/archive-builder.js';

/**
 * Descarga masiva de PDFs (§17.2).
 *
 * Cuelga de `admin/documents` y no de `admin/notes/...` porque no es el
 * documento de **un** pagaré: una ruta como `admin/notes/bundle` la habría
 * capturado el comodín `:id` del detalle.
 */
@Controller({ path: 'admin/documents', version: '1' })
@Roles('ADMIN')
export class DocumentsBundleController {
  constructor(
    private readonly bundle: BundleNotesUseCase,
    @Inject(ARCHIVE_BUILDER) private readonly archives: ArchiveBuilder,
  ) {}

  @Get('bundle')
  async notes(
    @Query('noteIds') noteIds: string | undefined,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
    @Res() response: Response,
  ): Promise<void> {
    const ids = (noteIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const pack = await this.bundle.execute(
      { noteIds: ids },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );

    response
      .status(200)
      .setHeader('Content-Type', 'application/zip')
      .setHeader('Content-Disposition', `attachment; filename="${pack.filename}"`)
      .setHeader('X-Bundle-Included', String(pack.included));

    // Se escribe según se comprime: cien PDFs no pasan juntos por la memoria.
    await this.archives.buildTo(pack.entries, response);
  }
}
