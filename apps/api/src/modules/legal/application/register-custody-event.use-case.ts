import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';

export type CustodyEventKind = 'RECEIVED' | 'MOVED' | 'HANDED_OVER' | 'RETURNED' | 'LOST';

export interface RegisterCustodyEventInput {
  noteId: string;
  kind: CustodyEventKind;
  occurredOn: string;
  location: string;
  holder: string;
  handedTo?: string | undefined;
  notes?: string | undefined;
}

export interface RegisterCustodyEventResult {
  id: string;
  location: string;
}

/**
 * Un movimiento del pagaré en papel (§13.6).
 *
 * Antes esto era un campo de texto que se sobrescribía: quedaba el último sitio
 * y se perdía todo lo demás. Con el histórico se puede contestar lo que importa
 * cuando el documento no aparece —quién lo tuvo, a quién se le entregó y
 * cuándo—, que es justo lo que hace falta para demandar, porque sin el original
 * no hay juicio ejecutivo.
 *
 * El movimiento se anexa y la posición actual del documento se copia al pagaré
 * en la misma transacción: dos verdades que se escriben juntas o no se escriben.
 */
@Injectable()
export class RegisterCustodyEventUseCase extends BaseUseCase<
  RegisterCustodyEventInput,
  RegisterCustodyEventResult
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RegisterCustodyEventUseCase.name));
  }

  protected async handle(
    input: RegisterCustodyEventInput,
    ctx: ExecutionContext,
  ): Promise<RegisterCustodyEventResult> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      select: { id: true },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      const created = await tx.custodyEvent.create({
        data: {
          noteId: input.noteId,
          kind: input.kind,
          occurredOn: new Date(`${input.occurredOn}T00:00:00Z`),
          location: input.location,
          holder: input.holder,
          handedTo: input.handedTo ?? null,
          notes: input.notes ?? null,
          registeredBy: ctx.actorId ?? 'system',
        },
      });

      // La posición actual vive también en el pagaré porque se consulta en cada
      // listado; el histórico es la verdad y esto, su último renglón.
      await tx.promissoryNote.update({
        where: { id: input.noteId },
        data: { physicalDocumentLocation: input.location },
      });

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'legal.custody',
          targetType: 'PromissoryNote',
          targetId: input.noteId,
          metadata: {
            kind: input.kind,
            location: input.location,
            holder: input.holder,
            handedTo: input.handedTo ?? null,
            at: this.clock.now().toISOString(),
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      return { id: created.id, location: created.location };
    });
  }
}
