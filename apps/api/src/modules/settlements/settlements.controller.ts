import { Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import { z } from 'zod';
import { formatMxn } from '@pagares/domain-rules';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { CloseSettlementUseCase } from './application/close-settlement.use-case.js';

const closeSchema = z.object({ outcome: z.enum(['FULFILLED', 'BROKEN']) }).strict();

@Controller({ path: 'admin/settlements', version: '1' })
@Roles('ADMIN')
export class SettlementsController {
  constructor(
    private readonly closeSettlement: CloseSettlementUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.settlement.findMany({
      include: { note: { include: { debtor: { select: { fullName: true } } } } },
      orderBy: [{ status: 'asc' }, { dueOn: 'asc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      noteId: r.noteId,
      folio: r.note.folio,
      debtorName: r.note.debtor.fullName,
      status: r.status,
      agreed: formatMxn(r.agreedCents),
      forgiven: formatMxn(r.forgivenCents),
      dueOn: r.dueOn.toISOString().slice(0, 10),
      terms: r.terms,
    }));
  }

  /**
   * Cierra un convenio (§13.4).
   *
   * Cumplido: el saldo se da por cubierto y la quita queda como pérdida explícita.
   * Incumplido: **el pagaré vuelve a su saldo original**. Perdonar la diferencia
   * sin que el convenio se cumpliera sería regalar dinero.
   */
  @Patch(':id')
  async close(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeSchema)) body: z.infer<typeof closeSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.closeSettlement.execute(
      { settlementId: id, outcome: body.outcome },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }
}
