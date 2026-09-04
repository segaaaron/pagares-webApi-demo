import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { accrueInterest, businessToday, daysOverdue, formatMxn } from '@pagares/domain-rules';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { acceptsPayments, deriveState } from '../../promissory-notes/domain/note-status.js';
import { NoteNotPayableError } from '../../promissory-notes/domain/note.errors.js';
import { checkSettlementTolerance } from '../domain/settlement-tolerance.js';

export interface ForgiveRemainderInput {
  noteId: string;
  reason: string;
}

export interface ForgiveRemainderOutput {
  paymentId: string;
  forgivenCents: string;
  status: string;
}

/**
 * Condonar el remanente para cerrar un pagaré (§25.16).
 *
 * El caso que lo motiva: el deudor consulta el lunes, transfiere el jueves, y
 * el interés de esos tres días deja un saldo de doscientos pesos. Sin esto, ese
 * pagaré queda abierto para siempre por una cantidad que nadie va a cobrar y
 * que ensucia toda la cartera vencida.
 *
 * Tres decisiones deliberadas:
 *
 * 1. **Nunca automático.** El umbral de Ajustes dice hasta cuánto se PUEDE
 *    condonar; condonar lo hace una persona con un motivo. Un pagaré marcado
 *    como pagado sin haberlo sido es peor que un saldo de doscientos pesos.
 * 2. **Entra en el libro de abonos**, no en un campo aparte, porque el saldo
 *    tiene que seguir siendo la suma de las filas: si esto viviera fuera, el
 *    cuadre de §22.5 empezaría a marcar descuadres que no lo son.
 * 3. **No es caja.** Va marcado con `isWaiver` y se excluye de lo cobrado.
 *    Contarlo como ingreso sería inventar dinero que nadie recibió.
 */
@Injectable()
export class ForgiveRemainderUseCase extends BaseUseCase<
  ForgiveRemainderInput,
  ForgiveRemainderOutput
> {
  constructor(
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ForgiveRemainderUseCase.name));
  }

  protected async handle(
    input: ForgiveRemainderInput,
    ctx: ExecutionContext,
  ): Promise<ForgiveRemainderOutput> {
    const now = this.clock.now();
    const today = businessToday(now);

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      // El mismo bloqueo que un abono: si entra dinero mientras se decide
      // condonar, el remanente que se perdona ya no es el que se vio.
      const [locked] = await tx.$queryRaw<
        {
          id: string;
          amountCents: bigint;
          paidCents: bigint;
          status: string;
          dueDate: Date;
          interestRateAnnualPct: string | null;
        }[]
      >`SELECT id, "amountCents", "paidCents", status::text, "dueDate", "interestRateAnnualPct"::text
        FROM "PromissoryNote" WHERE id = ${input.noteId} FOR UPDATE`;

      if (!locked) throw new NoteNotPayableError('inexistente');
      if (!acceptsPayments(locked.status as never)) throw new NoteNotPayableError(locked.status);

      const remainder = locked.amountCents - locked.paidCents;
      const settings = await tx.organizationSettings.findUnique({ where: { id: 'singleton' } });
      const tolerance = settings?.settlementToleranceCents ?? 0n;

      // El límite se comprueba aquí y no sólo al pintar el botón: es el que
      // separa "cerrar por unos pesos" de "perdonar una deuda".
      const check = checkSettlementTolerance(remainder, tolerance);
      if (!check.ok) {
        throw new BadRequestException(
          check.reason === 'sin-saldo'
            ? 'El pagaré no tiene saldo que condonar'
            : check.reason === 'sin-tolerancia'
              ? 'No hay tolerancia de liquidación configurada en Ajustes: nadie condona nada por omisión'
              : `El saldo de ${formatMxn(remainder)} pasa de la tolerancia de ${formatMxn(tolerance)}. ` +
                'Para perdonar más, se usa un convenio con quita.',
        );
      }

      const dueDate = locked.dueDate.toISOString().slice(0, 10);
      const overdue = daysOverdue(dueDate, now);
      const accrued = accrueInterest({
        balanceCents: remainder,
        annualRatePct:
          locked.interestRateAnnualPct === null ? null : Number(locked.interestRateAnnualPct),
        daysOverdue: overdue,
        basis: (settings?.interestBasis ?? 360) as 360 | 365,
      });

      const payment = await tx.payment.create({
        data: {
          noteId: input.noteId,
          amountCents: remainder,
          interestAccruedCents: accrued,
          // Se condona capital: el interés que no se cobró no fue "aplicado".
          appliedToInterestCents: 0n,
          appliedToPrincipalCents: remainder,
          isWaiver: true,
          paidOn: new Date(`${today}T00:00:00Z`),
          method: 'OTHER',
          memo: `Condonación del remanente: ${input.reason}`,
          registeredBy: ctx.actorId ?? 'system',
        },
      });

      const paidCents = locked.amountCents;
      const derived = deriveState({
        amountCents: locked.amountCents,
        paidCents,
        daysOverdue: overdue,
        hasSignature: true,
        signatureProcessing: false,
        voidedAt: null,
        writtenOffAt: null,
        renewedById: null,
        hasActiveSettlement: false,
      });

      await tx.promissoryNote.update({
        where: { id: input.noteId },
        data: {
          paidCents,
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
          action: 'payment.forgive_remainder',
          targetType: 'PromissoryNote',
          targetId: input.noteId,
          metadata: {
            paymentId: payment.id,
            forgivenCents: remainder.toString(),
            toleranceCents: tolerance.toString(),
            reason: input.reason,
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'NoteSettled',
        occurredAt: now,
        // El mismo evento que un pagaré liquidado con dinero: para el deudor la
        // consecuencia es idéntica —queda a paz y salvo y recibe su finiquito—.
        payload: {
          noteId: input.noteId,
          settledOn: today,
          byWaiver: true,
          forgivenCents: remainder.toString(),
        },
      });

      return {
        paymentId: payment.id,
        forgivenCents: remainder.toString(),
        status: derived.status,
      };
    });
  }
}
