import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import {
  accrueInterest,
  applyToSchedule,
  classifyAging,
  classifyPortfolio,
  daysOverdue,
  describeRate,
  describeRateWithAnnual,
  formatMxn,
  lateInterestBase,
  outstandingOrdinaryInterest,
} from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../media/domain/ports/object-storage.js';
import { allowedTransitions, withClock, type NoteStatus } from '../domain/note-status.js';

export interface NoteDetail {
  id: string;
  folio: string;
  status: NoteStatus;
  portfolioClass: string;
  agingBucket: string;
  collectionStage: string;
  daysOverdue: number;

  issuePlace: string;
  issueDate: string;
  paymentPlace: string;
  dueDate: string;
  prescribesOn: string | null;
  creditorName: string;

  amount: { cents: string; formatted: string };
  paid: { cents: string; formatted: string };
  balance: { cents: string; formatted: string };
  /** Interés devengado **al día de hoy**: se calcula, no se guarda (§12.3). */
  accruedInterest: { cents: string; formatted: string };
  /**
   * De qué está hecha la cuota cuando el pagaré es parte de un plan (§12).
   *
   * El deudor firma un pagaré de $6,027.73 y tiene derecho a saber que $1,800
   * de esos son el precio del préstamo. Se guarda al emitir, así que esto es lo
   * pactado y no un recálculo.
   */
  breakdown: {
    model: string;
    interest: { cents: string; formatted: string };
    principal: { cents: string; formatted: string };
    /** Del interés de la cuota, lo que queda por cubrir. */
    interestPending: { cents: string; formatted: string };
    /** La tasa **ordinaria** pactada. Nula en los pagarés anteriores a guardarla. */
    rateLabel: string | null;
  } | null;
  interestRateAnnualPct: number | null;
  /** Cómo se firmó: "3% mensual (36% anual)". Es lo que va en el documento. */
  /** Como se pactó, para el documento: «3% mensual». */
  interestRateLabel: string;
  /** Con su equivalencia anual simple, para las pantallas de operación. */
  interestRateOperationalLabel: string;
  /** Si circula por endoso o lleva la cláusula "no a la orden" (art. 25 LGTOC). */
  negotiable: boolean;
  interestPeriod: 'MONTHLY' | 'BIWEEKLY' | 'ANNUAL';
  amountInWords: string;
  observations: string | null;

  debtor: { id: string; fullName: string; address: string; phone: string; email: string | null };
  /**
   * El aval, como dato del título.
   *
   * Sin estado de firma: el sistema no tiene forma de capturarla, y un
   * «pendiente de firma» que nunca cambia promete un paso que no existe.
   */
  guarantors: {
    position: number;
    fullName: string;
    address: string;
    phone: string;
  }[];
  /**
   * El calendario de pagos, cuando la deuda se paga en cuotas (ADR 0022).
   *
   * Va con lo cubierto de cada cuota porque la pregunta al abrir el pagaré es
   * siempre la misma: por dónde va el plan y qué toca ahora.
   */
  schedule: {
    size: number;
    /** Cada cuánto se paga: `MONTHLY` o `BIWEEKLY`. */
    frequency: string;
    /** El plan tal como se pactó: cuánto se prestó y cuánto es el precio. */
    model: string;
    principal: { cents: string; formatted: string };
    interest: { cents: string; formatted: string };
    installments: {
      index: number;
      dueOn: string;
      status: string;
      daysOverdue: number;
      amount: { cents: string; formatted: string };
      interest: { cents: string; formatted: string };
      principal: { cents: string; formatted: string };
      paid: { cents: string; formatted: string };
      balance: { cents: string; formatted: string };
    }[];
  } | null;

  signature: {
    url: string;
    sha256: string;
    capturedAt: string;
    mode: string;
    deviceModel: string | null;
    strokeCount: number | null;
    durationMs: number | null;
  } | null;

  payments: {
    id: string;
    amount: string;
    appliedToInterest: string;
    /** El precio del préstamo, aparte de la sanción por atraso (ADR 0020). */
    appliedToOrdinaryInterest: string;
    appliedToPrincipal: string;
    paidOn: string;
    method: string;
    reference: string | null;
    isReversal: boolean;
    /** Condonación del remanente para cerrar el pagaré (§25.16). */
    isWaiver: boolean;
    registeredBy: string;
  }[];

  /** Qué acciones permite el estado actual: la web no decide esto (§19.5). */
  allowedTransitions: NoteStatus[];

  settlement: {
    id: string;
    agreed: string;
    forgiven: string;
    dueOn: string;
    status: string;
  } | null;

  legalCase: { id: string; fileNumber: string | null; courtName: string | null; openedOn: string } | null;
  physicalDocumentLocation: string | null;
  inLitigation: boolean;

  activities: {
    id: string;
    type: string;
    outcome: string;
    promisedOn: string | null;
    notes: string | null;
    createdAt: string;
  }[];

  audit: { id: string; action: string; actorRole: string; createdAt: string; metadata: unknown }[];
}

@Injectable()
export class GetNoteDetailUseCase extends BaseUseCase<{ id: string }, NoteDetail> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(GetNoteDetailUseCase.name));
  }

  protected async handle(input: { id: string }, _ctx: ExecutionContext): Promise<NoteDetail> {
    const now = this.clock.now();

    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.id },
      include: {
        debtor: true,
        signature: true,
        payments: { orderBy: { createdAt: 'desc' } },
        settlements: { where: { status: 'ACTIVE' }, take: 1 },
        legalCase: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
        guarantors: { orderBy: { position: 'asc' } },
        installments: { orderBy: { index: 'asc' } },
      },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const dueDate = note.dueDate.toISOString().slice(0, 10);

    /*
     * El calendario con lo cubierto de cada cuota (ADR 0022).
     *
     * Lo pagado se reparte al leer y no se guarda por cuota: la verdad de
     * cuánto se ha abonado es el libro de abonos, y una segunda cifra en cada
     * fila acabaría contradiciéndola. La cascada la hace `domain-rules`.
     */
    const schedule =
      note.installments.length > 0
        ? {
            size: note.installments.length,
            frequency: note.paymentFrequency,
            model: note.planModel ?? 'NONE',
            principal: {
              cents: (note.planPrincipalCents ?? note.amountCents).toString(),
              formatted: formatMxn(note.planPrincipalCents ?? note.amountCents),
            },
            interest: {
              cents: (note.planInterestCents ?? 0n).toString(),
              formatted: formatMxn(note.planInterestCents ?? 0n),
            },
            installments: applyToSchedule(
              note.installments.map((cuota) => ({
                index: cuota.index,
                dueOn: cuota.dueOn.toISOString().slice(0, 10),
                amountCents: cuota.amountCents,
                interestCents: cuota.interestCents,
                principalCents: cuota.principalCents,
              })),
              note.paidCents,
            ).map((cuota) => ({
              index: cuota.index,
              dueOn: cuota.dueOn,
              status: cuota.status,
              // Una cuota saldada no lleva atraso aunque su fecha ya pasara.
              daysOverdue:
                cuota.status === 'PAID' ? 0 : Math.max(0, daysOverdue(cuota.dueOn, now)),
              amount: { cents: cuota.amountCents.toString(), formatted: formatMxn(cuota.amountCents) },
              interest: {
                cents: cuota.interestCents.toString(),
                formatted: formatMxn(cuota.interestCents),
              },
              principal: {
                cents: cuota.principalCents.toString(),
                formatted: formatMxn(cuota.principalCents),
              },
              paid: { cents: cuota.paidCents.toString(), formatted: formatMxn(cuota.paidCents) },
              balance: {
                cents: cuota.balanceCents.toString(),
                formatted: formatMxn(cuota.balanceCents),
              },
            })),
          }
        : null;

    const overdue = daysOverdue(dueDate, now);
    const balance = note.amountCents - note.paidCents;

    /*
     * El calendario del pagaré. Un pagaré de pago único no tiene tabla: el
     * título entero es su única cuota, y así se le trata para que el reparto sea
     * uno solo y no dos casos que un día se contradigan (ADR 0022).
     */
    const calendario =
      note.installments.length > 0
        ? note.installments.map((cuota) => ({
            index: cuota.index,
            dueOn: cuota.dueOn.toISOString().slice(0, 10),
            amountCents: cuota.amountCents,
            interestCents: cuota.interestCents,
            principalCents: cuota.principalCents,
          }))
        : [
            {
              index: 1,
              dueOn: dueDate,
              amountCents: note.amountCents,
              interestCents: note.planInterestCents ?? 0n,
              principalCents: note.amountCents - (note.planInterestCents ?? 0n),
            },
          ];

    /*
     * El interés ordinario que el calendario todavía no ha cobrado. La mora no
     * corre sobre esa parte (ADR 0020): sería interés sobre interés.
     */
    const ordinarioDeLaCuota = note.planInterestCents ?? 0n;
    const ordinarioPendiente = outstandingOrdinaryInterest(calendario, note.paidCents);

    const accrued = accrueInterest({
      balanceCents: lateInterestBase({
        balanceCents: balance,
        ordinaryInterestPendingCents: ordinarioPendiente,
        overPrincipalOnly: settings?.lateInterestOverPrincipalOnly ?? true,
      }),
      annualRatePct: note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
      daysOverdue: overdue,
      basis: (settings?.interestBasis ?? 360) as 360 | 365,
    });

    const dinero = (cents: bigint): { cents: string; formatted: string } => ({
      cents: cents.toString(),
      formatted: formatMxn(cents),
    });

    return {
      id: note.id,
      folio: note.folio,
      status: withClock(note.status, overdue),
      portfolioClass: classifyPortfolio(overdue),
      agingBucket: classifyAging(overdue),
      collectionStage: note.collectionStage,
      daysOverdue: overdue,

      issuePlace: note.issuePlace,
      issueDate: note.issueDate.toISOString().slice(0, 10),
      paymentPlace: note.paymentPlace,
      dueDate,
      prescribesOn: note.prescribesOn?.toISOString().slice(0, 10) ?? null,
      creditorName: note.creditorName,

      amount: { cents: note.amountCents.toString(), formatted: formatMxn(note.amountCents) },
      paid: { cents: note.paidCents.toString(), formatted: formatMxn(note.paidCents) },
      balance: { cents: balance.toString(), formatted: formatMxn(balance) },
      accruedInterest: { cents: accrued.toString(), formatted: formatMxn(accrued) },
      breakdown:
        note.planModel && note.planModel !== 'NONE'
          ? {
              model: note.planModel,
              interest: dinero(ordinarioDeLaCuota),
              principal: dinero(note.planPrincipalCents ?? note.amountCents - ordinarioDeLaCuota),
              interestPending: dinero(ordinarioPendiente),
              /*
               * A qué precio se prestó, con todas las letras. Es la tasa
               * **ordinaria**, distinta de la moratoria de arriba: enseñar sólo
               * aquélla obligaba a suponer que eran la misma, y no lo son.
               * Los pagarés emitidos antes de guardarla no la tienen.
               */
              rateLabel:
                note.planRateAnnualPct === null
                  ? null
                  : describeRateWithAnnual(
                      Number(note.planRateAnnualPct),
                      note.planRatePeriod ?? 'ANNUAL',
                    ),
            }
          : null,
      interestRateAnnualPct:
        note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
      interestPeriod: note.interestPeriod,
      negotiable: note.negotiable,
      interestRateLabel: describeRate(
        note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
        note.interestPeriod,
      ),
      interestRateOperationalLabel: describeRateWithAnnual(
        note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
        note.interestPeriod,
      ),
      amountInWords: note.amountInWords,
      observations: note.observations,

      guarantors: note.guarantors.map((guarantor) => ({
        position: guarantor.position,
        fullName: guarantor.fullName,
        address: guarantor.address,
        phone: guarantor.phone,
      })),

      schedule,

      debtor: {
        id: note.debtor.id,
        fullName: note.debtor.fullName,
        address: note.debtor.address,
        phone: note.debtor.phone,
        email: note.debtor.email,
      },

      signature: note.signature
        ? {
            // URL temporal de 15 minutos: el bucket sigue privado (§8.2).
            url: await this.storage.signedUrl(note.signature.assetId),
            sha256: note.signature.sha256,
            capturedAt: note.signature.capturedAt.toISOString(),
            mode: note.signature.mode,
            deviceModel: note.signature.deviceModel,
            strokeCount: note.signature.strokeCount,
            durationMs: note.signature.durationMs,
          }
        : null,

      payments: note.payments.map((p) => ({
        id: p.id,
        amount: formatMxn(p.amountCents),
        appliedToInterest: formatMxn(p.appliedToInterestCents),
        appliedToOrdinaryInterest: formatMxn(p.appliedToOrdinaryInterestCents),
        appliedToPrincipal: formatMxn(p.appliedToPrincipalCents),
        paidOn: p.paidOn.toISOString().slice(0, 10),
        method: p.method,
        reference: p.reference,
        isReversal: p.reversalOfId !== null,
        isWaiver: p.isWaiver,
        registeredBy: p.registeredBy,
      })),

      allowedTransitions: [...allowedTransitions(note.status)],

      settlement: note.settlements[0]
        ? {
            id: note.settlements[0].id,
            agreed: formatMxn(note.settlements[0].agreedCents),
            forgiven: formatMxn(note.settlements[0].forgivenCents),
            dueOn: note.settlements[0].dueOn.toISOString().slice(0, 10),
            status: note.settlements[0].status,
          }
        : null,

      legalCase: note.legalCase
        ? {
            id: note.legalCase.id,
            fileNumber: note.legalCase.fileNumber,
            courtName: note.legalCase.courtName,
            openedOn: note.legalCase.openedOn.toISOString().slice(0, 10),
          }
        : null,
      physicalDocumentLocation: note.physicalDocumentLocation,
      inLitigation: note.inLitigation,

      activities: note.activities.map((a) => ({
        id: a.id,
        type: a.type,
        outcome: a.outcome,
        promisedOn: a.promisedOn?.toISOString().slice(0, 10) ?? null,
        notes: a.notes,
        createdAt: a.createdAt.toISOString(),
      })),

      // La bitácora del pagaré: quién hizo qué y cuándo (§19.5).
      audit: (
        await this.prisma.auditLog.findMany({
          where: { targetType: 'PromissoryNote', targetId: note.id },
          orderBy: { chainIndex: 'desc' },
          take: 30,
        })
      ).map((a) => ({
        id: a.id,
        action: a.action,
        actorRole: a.actorRole,
        createdAt: a.createdAt.toISOString(),
        metadata: a.metadata,
      })),
    };
  }
}
