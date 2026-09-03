import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { civilDateSchema } from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { AuditService } from '../../shared/persistence/audit.service.js';

const openCaseSchema = z
  .object({
    courtName: z.string().trim().max(160).optional(),
    fileNumber: z.string().trim().max(80).optional(),
    lawyerName: z.string().trim().max(160).optional(),
    lawyerPhone: z.string().trim().max(20).optional(),
    openedOn: civilDateSchema,
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

const actionSchema = z
  .object({
    occurredOn: civilDateSchema,
    description: z.string().trim().min(3).max(1000),
    assetIds: z.array(z.string()).max(20).default([]),
  })
  .strict();

const custodySchema = z
  .object({ physicalDocumentLocation: z.string().trim().min(2).max(240) })
  .strict();

/**
 * Expediente judicial (§13.6).
 *
 * El sistema **no litiga**: registra dónde está el expediente, quién lo lleva y
 * qué ha pasado, para que quien retome el caso no empiece de cero.
 *
 * Y registra dónde está el **pagaré original en papel**: para demandar hace falta
 * el documento físico, y saber en qué caja está no es un detalle menor.
 */
@Controller({ path: 'admin/notes/:noteId', version: '1' })
@Roles('ADMIN')
export class LegalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('legal-case')
  async open(
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(openCaseSchema)) body: z.infer<typeof openCaseSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const existing = await this.prisma.legalCase.findUnique({ where: { noteId } });
    if (existing) throw new BadRequestException('El pagaré ya tiene expediente abierto');

    const created = await this.prisma.legalCase.create({
      data: {
        noteId,
        courtName: body.courtName ?? null,
        fileNumber: body.fileNumber ?? null,
        lawyerName: body.lawyerName ?? null,
        lawyerPhone: body.lawyerPhone ?? null,
        openedOn: new Date(`${body.openedOn}T00:00:00Z`),
        notes: body.notes ?? null,
        openedBy: actor.id,
      },
    });

    // En juicio es una bandera, no un estado: convive con vencido o castigado (§11.1).
    await this.prisma.promissoryNote.update({
      where: { id: noteId },
      data: { inLitigation: true, collectionStage: 'JUDICIAL' },
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'legal.open_case',
      targetType: 'PromissoryNote',
      targetId: noteId,
      metadata: { caseId: created.id, fileNumber: body.fileNumber ?? null },
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    });

    return { id: created.id };
  }

  @Get('legal-case')
  async detail(@Param('noteId') noteId: string) {
    const legalCase = await this.prisma.legalCase.findUnique({
      where: { noteId },
      include: { actions: { orderBy: { occurredOn: 'desc' } } },
    });
    if (!legalCase) return null;

    return {
      id: legalCase.id,
      courtName: legalCase.courtName,
      fileNumber: legalCase.fileNumber,
      lawyerName: legalCase.lawyerName,
      lawyerPhone: legalCase.lawyerPhone,
      openedOn: legalCase.openedOn.toISOString().slice(0, 10),
      closedOn: legalCase.closedOn?.toISOString().slice(0, 10) ?? null,
      notes: legalCase.notes,
      actions: legalCase.actions.map((a) => ({
        id: a.id,
        occurredOn: a.occurredOn.toISOString().slice(0, 10),
        description: a.description,
        registeredBy: a.registeredBy,
      })),
    };
  }

  @Post('legal-case/actions')
  async addAction(
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(actionSchema)) body: z.infer<typeof actionSchema>,
    @CurrentActor() actor: Actor,
  ) {
    const legalCase = await this.prisma.legalCase.findUnique({ where: { noteId } });
    if (!legalCase) throw new BadRequestException('El pagaré no tiene expediente abierto');

    const created = await this.prisma.legalAction.create({
      data: {
        caseId: legalCase.id,
        occurredOn: new Date(`${body.occurredOn}T00:00:00Z`),
        description: body.description,
        assetIds: body.assetIds,
        registeredBy: actor.id,
      },
    });
    return { id: created.id };
  }

  /** Dónde está el pagaré original en papel: sin él no se puede demandar. */
  @Patch('custody')
  async custody(
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(custodySchema)) body: z.infer<typeof custodySchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    await this.prisma.promissoryNote.update({
      where: { id: noteId },
      data: { physicalDocumentLocation: body.physicalDocumentLocation },
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: 'legal.custody',
      targetType: 'PromissoryNote',
      targetId: noteId,
      metadata: { location: body.physicalDocumentLocation },
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    });

    return { ok: true };
  }
}
