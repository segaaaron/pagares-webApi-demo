import { BadRequestException, Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { civilDateSchema } from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { AuditService } from '../../shared/persistence/audit.service.js';
import { RegisterCustodyEventUseCase } from './application/register-custody-event.use-case.js';

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

/**
 * Un movimiento del documento físico, no sólo su sitio actual.
 *
 * Antes esto era un `physicalDocumentLocation` que se sobrescribía: quedaba el
 * último sitio y desaparecía quién lo tuvo antes. Ahora cada movimiento se
 * anexa con responsable y fecha, que es lo que el plan pide en §13.6 y lo que
 * hace falta el día que el pagaré no aparece.
 */
const custodySchema = z
  .object({
    kind: z.enum(['RECEIVED', 'MOVED', 'HANDED_OVER', 'RETURNED', 'LOST']),
    occurredOn: civilDateSchema,
    location: z.string().trim().min(2).max(240),
    holder: z.string().trim().min(2).max(160),
    handedTo: z.string().trim().max(160).optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((body) => body.kind !== 'HANDED_OVER' || (body.handedTo ?? '') !== '', {
    message: 'Una entrega tiene que decir a quién se le entregó',
    path: ['handedTo'],
  });

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
    private readonly custody: RegisterCustodyEventUseCase,
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

  /**
   * Dónde está el pagaré original en papel, y por dónde ha pasado.
   *
   * Sin el documento no hay juicio ejecutivo, así que la pregunta que este
   * histórico contesta —"¿quién lo tuvo y a quién se lo dio?"— es la que decide
   * si una deuda se puede cobrar en tribunales o no.
   */
  @Post('custody')
  async registerCustody(
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(custodySchema)) body: z.infer<typeof custodySchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.custody.execute(
      {
        noteId,
        kind: body.kind,
        occurredOn: body.occurredOn,
        location: body.location,
        holder: body.holder,
        ...(body.handedTo !== undefined ? { handedTo: body.handedTo } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }

  @Get('custody')
  async custodyLog(@Param('noteId') noteId: string) {
    const [note, events] = await Promise.all([
      this.prisma.promissoryNote.findUnique({
        where: { id: noteId },
        select: { physicalDocumentLocation: true, status: true },
      }),
      this.prisma.custodyEvent.findMany({
        where: { noteId },
        orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const ultimo = events[0] ?? null;

    return {
      currentLocation: note?.physicalDocumentLocation ?? null,
      currentHolder: ultimo?.holder ?? null,
      /**
       * Art. 129 LGTOC: al pagar, el deudor puede exigir que se le devuelva el
       * título. Un pagaré liquidado cuyo papel sigue en nuestro poder es un
       * documento que todavía puede circular, y eso es un riesgo real para
       * quien ya pagó.
       */
      pendingReturn:
        note?.status === 'PAID' && events.length > 0 && ultimo?.kind !== 'RETURNED',
      events: events.map((event) => ({
        id: event.id,
        kind: event.kind,
        occurredOn: event.occurredOn.toISOString().slice(0, 10),
        location: event.location,
        holder: event.holder,
        handedTo: event.handedTo,
        notes: event.notes,
        registeredBy: event.registeredBy,
      })),
    };
  }
}
