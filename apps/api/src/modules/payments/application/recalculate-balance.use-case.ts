import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { daysOverdue, formatMxn } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { deriveState } from '../../promissory-notes/domain/note-status.js';

export interface RecalculateBalanceOutput {
  folio: string;
  /** Lo que decía el pagaré antes de recalcular. */
  before: string;
  /** Lo que suma el libro de abonos, que es la verdad (§12.2). */
  after: string;
  difference: string;
  status: string;
  /** `false` cuando ya cuadraba: la operación es idempotente. */
  changed: boolean;
}

/**
 * Recalcula el saldo de un pagaré desde su libro de abonos (§22.5).
 *
 * `paidCents` es una **copia** de la suma del libro, guardada para no sumar en
 * cada lectura. Una copia se puede desviar —una corrección a mano en la base, un
 * proceso muerto a medias, una importación de una versión con un fallo— y hasta
 * ahora el sistema sabía detectarlo pero no tenía forma de arreglarlo: el cuadre
 * salía en rojo y la única salida era abrir `psql`.
 *
 * Esto no inventa ni borra nada: **no toca el libro**, que es sólo de anexar
 * (§7). Recalcula la copia a partir de las filas y vuelve a derivar el estado,
 * la clasificación y el tramo (§11.2). Si el descuadre venía de un abono que
 * falta, el resultado lo hará evidente —el saldo subirá— y entonces lo que toca
 * es asentar ese abono, no ajustar el número.
 *
 * Queda en la bitácora con actor, importes antes y después (§9.3).
 */
@Injectable()
export class RecalculateBalanceUseCase extends BaseUseCase<
  { noteId: string },
  RecalculateBalanceOutput
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RecalculateBalanceUseCase.name));
  }

  protected async handle(
    input: { noteId: string },
    ctx: ExecutionContext,
  ): Promise<RecalculateBalanceOutput> {
    const now = this.clock.now();

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      // Bloqueo de fila: recalcular mientras entra un abono daría un saldo que
      // ya nace viejo.
      const [locked] = await tx.$queryRaw<
        {
          id: string;
          folio: string;
          amountCents: bigint;
          paidCents: bigint;
          dueDate: Date;
          voidedAt: Date | null;
          writtenOffAt: Date | null;
          signatureMode: string | null;
        }[]
      >`SELECT id, folio, "amountCents", "paidCents", "dueDate", "voidedAt", "writtenOffAt",
               "signatureMode"::text
        FROM "PromissoryNote" WHERE id = ${input.noteId} FOR UPDATE`;

      if (!locked) throw new NotFoundException('El pagaré no existe');

      const rows = await tx.payment.findMany({
        where: { noteId: locked.id },
        select: { amountCents: true },
      });

      // Las reversas van con importe negativo, así que la suma del libro ya
      // descuenta los abonos anulados (§12.2).
      let ledger = 0n;
      for (const row of rows) ledger += row.amountCents;

      const difference = locked.paidCents - ledger;
      if (difference === 0n) {
        return {
          folio: locked.folio,
          before: formatMxn(locked.paidCents),
          after: formatMxn(ledger),
          difference: formatMxn(0n),
          status: 'sin cambios',
          changed: false,
        };
      }

      const signature = await tx.signature.findUnique({ where: { noteId: locked.id } });

      /*
       * «Renovado» no es una columna de este pagaré: es que exista otro que lo
       * sustituye y lo apunte con `renewedFromId`. Buscarlo aquí en vez de leer
       * un campo inexistente es lo que evita que la derivación devuelva el
       * pagaré viejo a la cartera activa.
       */
      const sucesor = await tx.promissoryNote.findFirst({
        where: { renewedFromId: locked.id },
        select: { id: true },
      });
      const settlement = await tx.settlement.findFirst({
        where: { noteId: locked.id, status: 'ACTIVE' },
      });

      const overdue = daysOverdue(locked.dueDate.toISOString().slice(0, 10), now);
      const derived = deriveState({
        amountCents: locked.amountCents,
        paidCents: ledger,
        daysOverdue: overdue,
        // El papel cuenta como firmado, igual que en el resto del sistema (§24.5).
        hasSignature: signature !== null || locked.signatureMode === 'PAPER',
        signatureProcessing: false,
        voidedAt: locked.voidedAt,
        writtenOffAt: locked.writtenOffAt,
        renewedById: sucesor?.id ?? null,
        hasActiveSettlement: settlement !== null,
      });

      await tx.promissoryNote.update({
        where: { id: locked.id },
        data: {
          paidCents: ledger,
          status: derived.status,
          portfolioClass: derived.portfolioClass,
          agingBucket: derived.agingBucket,
          daysOverdue: overdue,
        },
      });

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'note.recalculate_balance',
          targetType: 'PromissoryNote',
          targetId: locked.id,
          metadata: {
            before: locked.paidCents.toString(),
            after: ledger.toString(),
            difference: difference.toString(),
            status: derived.status,
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      return {
        folio: locked.folio,
        before: formatMxn(locked.paidCents),
        after: formatMxn(ledger),
        difference: formatMxn(difference),
        status: derived.status,
        changed: true,
      };
    });
  }
}
