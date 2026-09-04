import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import {
  accrueInterest,
  classifyAging,
  classifyPortfolio,
  daysOverdue,
  describeRate,
  formatMxn,
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
  interestRateAnnualPct: number | null;
  /** Cómo se firmó: "3% mensual (36% anual)". Es lo que va en el documento. */
  interestRateLabel: string;
  /** Si circula por endoso o lleva la cláusula "no a la orden" (art. 25 LGTOC). */
  negotiable: boolean;
  interestPeriod: 'MONTHLY' | 'ANNUAL';
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
   * La serie a la que pertenece, cuando la deuda se documentó en varios pagos.
   *
   * Van los hermanos con su estado y su saldo porque la pregunta al abrir uno
   * es siempre la misma: cómo va el resto del plan (§12).
   */
  series: {
    id: string;
    index: number;
    size: number;
    notes: {
      id: string;
      folio: string;
      index: number;
      status: string;
      dueDate: string;
      amount: { cents: string; formatted: string };
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
      },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const settings = await this.prisma.organizationSettings.findUnique({ where: { id: 'singleton' } });
    const dueDate = note.dueDate.toISOString().slice(0, 10);

    /*
     * Los hermanos de la serie. La pregunta al abrir uno de doce es siempre
     * cómo va el resto del plan, y sin esto había que volver a la cartera y
     * buscarlos por el nombre del deudor.
     */
    const hermanos = note.seriesId
      ? await (async () => {
          const filas = await this.prisma.promissoryNote.findMany({
            where: { seriesId: note.seriesId },
            orderBy: { seriesIndex: 'asc' },
            select: {
              id: true,
              folio: true,
              seriesIndex: true,
              status: true,
              dueDate: true,
              amountCents: true,
              paidCents: true,
            },
          });

          return {
            // Dentro de la rama, `seriesId` ya no puede ser nulo.
            id: note.seriesId as string,
            index: note.seriesIndex ?? 1,
            size: note.seriesSize ?? filas.length,
            notes: filas.map((fila) => {
              const saldo = fila.amountCents - fila.paidCents;
              const atraso = daysOverdue(fila.dueDate.toISOString().slice(0, 10), now);
              return {
                id: fila.id,
                folio: fila.folio,
                index: fila.seriesIndex ?? 0,
                // Con reloj, como en el listado: un pagaré vencido no espera a
                // que alguien le cambie el estado a mano (§11.2).
                status: withClock(fila.status as NoteStatus, atraso),
                dueDate: fila.dueDate.toISOString().slice(0, 10),
                amount: {
                  cents: fila.amountCents.toString(),
                  formatted: formatMxn(fila.amountCents),
                },
                balance: { cents: saldo.toString(), formatted: formatMxn(saldo) },
              };
            }),
          };
        })()
      : null;
    const overdue = daysOverdue(dueDate, now);
    const balance = note.amountCents - note.paidCents;

    const accrued = accrueInterest({
      balanceCents: balance,
      annualRatePct: note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
      daysOverdue: overdue,
      basis: (settings?.interestBasis ?? 360) as 360 | 365,
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
      interestRateAnnualPct:
        note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
      interestPeriod: note.interestPeriod,
      negotiable: note.negotiable,
      interestRateLabel: describeRate(
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

      series: hermanos,

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
