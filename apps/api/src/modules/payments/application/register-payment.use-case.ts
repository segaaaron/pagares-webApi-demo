import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import type { RegisterPaymentRequest } from '@pagares/contracts';
import { accrueInterest, businessToday, daysOverdue, lateInterestBase } from '@pagares/domain-rules';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { acceptsPayments, deriveState } from '../../promissory-notes/domain/note-status.js';
import {
  NoteNotPayableError,
  PaymentExceedsBalanceError,
} from '../../promissory-notes/domain/note.errors.js';
import { splitPayment } from '../domain/payment-application.js';

export interface RegisterPaymentInput extends RegisterPaymentRequest {
  noteId: string;
}

export interface RegisterPaymentOutput {
  paymentId: string;
  balanceCents: string;
  status: string;
  appliedToInterestCents: string;
  /** El precio del préstamo, aparte de la sanción por atraso (ADR 0020). */
  appliedToOrdinaryInterestCents: string;
  appliedToPrincipalCents: string;
}

/**
 * Registro de un abono (§12.2).
 *
 * El punto delicado es la concurrencia: dos administradores abonando a la vez
 * podrían sobrepagar si cada uno lee el saldo antes de que el otro escriba. Por
 * eso se toma bloqueo de fila sobre el pagaré ANTES de leer el saldo, y el
 * recálculo del estado ocurre en la misma transacción que el asiento.
 */
@Injectable()
export class RegisterPaymentUseCase extends BaseUseCase<RegisterPaymentInput, RegisterPaymentOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RegisterPaymentUseCase.name));
  }

  protected async handle(
    input: RegisterPaymentInput,
    ctx: ExecutionContext,
  ): Promise<RegisterPaymentOutput> {
    const now = this.clock.now();
    const today = businessToday(now);
    const amountCents = BigInt(input.amountCents);

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      // Bloqueo pesimista dentro de la transacción. Con `this.prisma` la consulta
      // saldría por otra conexión, el bloqueo se soltaría de inmediato y dos
      // abonos simultáneos se pisarían el saldo.
      const [locked] = await tx.$queryRaw<
        {
          id: string;
          amountCents: bigint;
          paidCents: bigint;
          status: string;
          dueDate: Date;
          interestRateAnnualPct: string | null;
          planInterestCents: bigint | null;
        }[]
      >`SELECT id, "amountCents", "paidCents", status::text, "dueDate", "interestRateAnnualPct"::text,
               "planInterestCents"
        FROM "PromissoryNote" WHERE id = ${input.noteId} FOR UPDATE`;

      if (!locked) throw new NoteNotPayableError('inexistente');
      if (!acceptsPayments(locked.status as never)) throw new NoteNotPayableError(locked.status);

      const balanceCents = locked.amountCents - locked.paidCents;
      if (amountCents > balanceCents) throw new PaymentExceedsBalanceError(balanceCents);

      const settings = await tx.organizationSettings.findUnique({ where: { id: 'singleton' } });
      const dueDate = locked.dueDate.toISOString().slice(0, 10);
      const overdue = daysOverdue(dueDate, now);

      /*
       * El interés **ordinario** que esta cuota todavía no ha cubierto: el
       * precio del préstamo que lleva dentro (§12), menos lo que ya se le abonó.
       * Las reversas entran con signo negativo, así que la suma se corrige sola.
       */
      const ordinarioDeLaCuota = locked.planInterestCents ?? 0n;
      const yaAbonadoAlOrdinario = await tx.payment.aggregate({
        where: { noteId: input.noteId },
        _sum: { appliedToOrdinaryInterestCents: true },
      });
      const ordinarioPendiente =
        ordinarioDeLaCuota - (yaAbonadoAlOrdinario._sum.appliedToOrdinaryInterestCents ?? 0n);

      /*
       * Sobre qué corre el moratorio (ADR 0020).
       *
       * Por omisión, sólo sobre el **capital**: el art. 363 del Código de
       * Comercio dice que los intereses vencidos y no pagados no devengan
       * intereses salvo pacto de capitalizarlos, y la cuota lleva su interés
       * ordinario dentro. Quien tenga ese pacto lo apaga en Ajustes, y entonces
       * es una decisión escrita.
       */
      const baseDelMoratorio = lateInterestBase({
        balanceCents,
        ordinaryInterestPendingCents: ordinarioPendiente,
        overPrincipalOnly: settings?.lateInterestOverPrincipalOnly ?? true,
      });

      // Snapshot: el interés histórico no se recalcula aunque cambie la tasa (§12.3).
      const accrued = accrueInterest({
        balanceCents: baseDelMoratorio,
        annualRatePct: locked.interestRateAnnualPct === null ? null : Number(locked.interestRateAnnualPct),
        daysOverdue: overdue,
        basis: (settings?.interestBasis ?? 360) as 360 | 365,
      });

      const split = splitPayment({
        amountCents,
        lateInterestCents: accrued,
        ordinaryInterestPendingCents: ordinarioPendiente,
        interestFirst: settings?.applyPaymentToInterestFirst ?? true,
      });
      const isRecovery = locked.status === 'WRITTEN_OFF';

      const payment = await tx.payment.create({
        data: {
          noteId: input.noteId,
          amountCents,
          interestAccruedCents: accrued,
          appliedToInterestCents: split.toInterestCents,
          appliedToOrdinaryInterestCents: split.toOrdinaryInterestCents,
          appliedToPrincipalCents: split.toPrincipalCents,
          isRecovery,
          paidOn: new Date(`${input.paidOn}T00:00:00Z`),
          method: input.method,
          reference: input.reference ?? null,
          memo: input.memo ?? null,
          registeredBy: ctx.actorId ?? 'system',
        },
      });

      const paidCents = locked.paidCents + amountCents;
      const derived = deriveState({
        amountCents: locked.amountCents,
        paidCents,
        daysOverdue: overdue,
        hasSignature: true,
        signatureProcessing: false,
        voidedAt: null,
        // Un abono sobre castigado es recuperación: no lo devuelve a cartera activa.
        writtenOffAt: isRecovery ? now : null,
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
          action: 'payment.register',
          targetType: 'PromissoryNote',
          targetId: input.noteId,
          metadata: { paymentId: payment.id, amountCents: amountCents.toString(), isRecovery },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'PaymentRegistered',
        occurredAt: now,
        payload: {
          noteId: input.noteId,
          paymentId: payment.id,
          amountCents: amountCents.toString(),
          balanceCents: (locked.amountCents - paidCents).toString(),
        },
      });

      if (derived.status === 'PAID') {
        scope.publish({
          eventId: randomUUID(),
          eventType: 'NoteSettled',
          occurredAt: now,
          payload: { noteId: input.noteId, settledOn: today },
        });
      }

      return {
        paymentId: payment.id,
        balanceCents: (locked.amountCents - paidCents).toString(),
        status: derived.status,
        appliedToInterestCents: split.toInterestCents.toString(),
        appliedToOrdinaryInterestCents: split.toOrdinaryInterestCents.toString(),
        appliedToPrincipalCents: split.toPrincipalCents.toString(),
      };
    });
  }
}
