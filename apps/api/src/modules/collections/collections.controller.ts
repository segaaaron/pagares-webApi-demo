import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { civilDateSchema } from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { RegisterActivityUseCase } from './application/register-activity.use-case.js';

const activitySchema = z
  .object({
    type: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'OTHER']),
    outcome: z.enum(['NO_ANSWER', 'PROMISED', 'REFUSED', 'PAID', 'DISPUTED']),
    promisedOn: civilDateSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

@Controller({ path: 'admin/notes/:noteId/activities', version: '1' })
@Roles('ADMIN')
export class CollectionsController {
  constructor(
    private readonly register: RegisterActivityUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(activitySchema)) body: z.infer<typeof activitySchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.register.execute(
      { noteId, ...body },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }

  @Get()
  async list(@Param('noteId') noteId: string) {
    const rows = await this.prisma.collectionActivity.findMany({
      where: { noteId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      outcome: r.outcome,
      promisedOn: r.promisedOn?.toISOString().slice(0, 10) ?? null,
      promiseKept: r.promiseKept,
      notes: r.notes,
      registeredBy: r.registeredBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
