import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import {
  accrueInterest,
  applyToSchedule,
  businessToday,
  daysBetween,
  formatMxn,
  lateInterestBase,
  pendingOrdinaryInterest,
  settleEarly,
  type PendingInstallment,
  type PlanModel,
} from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { NoteNotFoundError, SimulationDateInPastError } from '../domain/note.errors.js';
import { isSigned, type NoteStatus } from '../domain/note-status.js';

export interface SimulateEarlyPayoffInput {
  noteId: string;
  /** Fecha civil de la liquidación. Por omisión, hoy. */
  onDate?: string | undefined;
  /**
   * Cuando lo pregunta el deudor desde su aplicación: el filtro por dueño va en
   * la consulta y no en un `if` posterior, que es la defensa contra ver el
   * pagaré de otro (§9.1, API1).
   */
  ownerId?: string | undefined;
  /**
   * Contestar sólo por lo que el deudor ya firmó.
   *
   * El plan es por folio y sólo con el folio firmado: lo que no ha firmado no
   * es deuda suya, así que meterlo en la cifra de liquidación sería cobrarle
   * por algo que todavía puede rechazar (§12).
   */
  signedOnly?: boolean | undefined;
}

interface Money {
  cents: string;
  formatted: string;
}

export interface EarlyPayoffSimulation {
  onDate: string;
  planModel: PlanModel;
  /** Cuántos pagarés de la serie quedan por saldar y cuántos ya vencieron. */
  pendingCount: number;
  dueCount: number;
  /** El capital que queda por devolver. */
  principal: Money;
  /** El interés ordinario que se debe pese a adelantar el pago. */
  interestDue: Money;
  /** El interés ordinario que se ahorra por pagar antes. */
  saved: Money;
  /** El moratorio de las cuotas que se pagaron tarde (§12.3). No se perdona. */
  lateInterest: Money;
  /** Lo que hay que entregar ese día para quedar a mano. */
  total: Money;
  /** Lo que costaría seguir el calendario hasta el final. */
  scheduleTotal: Money;
  summary: string;
}

const money = (cents: bigint): Money => ({ cents: cents.toString(), formatted: formatMxn(cents) });

const LONG_DATE = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Liquidación anticipada (§12, ADR 0022): "si paga todo hoy, ¿cuánto es?".
 *
 * La respuesta depende de cómo se pactó el interés ordinario, y por eso no hay
 * una sola: sobre **saldos insolutos** el interés es el precio del tiempo y el
 * que no transcurre no se cobra; sobre **saldo global** se pactó de una vez
 * sobre el importe original y adelantar no lo baja. La regla vive en
 * `domain-rules`; aquí sólo se reúne el calendario y se le pregunta.
 *
 * El **moratorio** se suma aparte porque no es lo mismo: sanciona los días de
 * atraso ya corridos, y ésos no se devuelven pagando hoy.
 *
 * No guarda nada: es una consulta, y otro día da otro número.
 */
@Injectable()
export class SimulateEarlyPayoffUseCase extends BaseUseCase<
  SimulateEarlyPayoffInput,
  EarlyPayoffSimulation
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(SimulateEarlyPayoffUseCase.name));
  }

  protected async handle(
    input: SimulateEarlyPayoffInput,
    _ctx: ExecutionContext,
  ): Promise<EarlyPayoffSimulation> {
    const note = await this.prisma.promissoryNote.findFirst({
      where: { id: input.noteId, ...(input.ownerId ? { ownerId: input.ownerId } : {}) },
      include: { installments: { orderBy: { index: 'asc' } } },
    });
    if (!note) throw new NoteNotFoundError();

    const today = businessToday(this.clock.now());
    const onDate = input.onDate ?? today;
    if (daysBetween(today, onDate) < 0) throw new SimulationDateInPastError();

    /*
     * Liquidar es saldar la deuda entera, no una cuota: se pregunta por el
     * pagaré y se contesta por todo su calendario (ADR 0022).
     *
     * Un anulado no se debe y un renovado se debe en el documento nuevo
     * (§13.7); y mientras el título no esté firmado, al deudor no se le enseña
     * como suyo lo que todavía puede rechazar (ADR 0018).
     */
    const vivo =
      note.status !== 'VOID' &&
      note.status !== 'RENEWED' &&
      (!input.signedOnly || isSigned(note.status as NoteStatus));

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
    });
    const basis = (settings?.interestBasis ?? 360) as 360 | 365;

    /*
     * Cuánto del interés ordinario se ha cubierto ya. Se lee del libro de
     * abonos y no se deduce del importe pagado: desde el ADR 0020 el reparto
     * queda escrito en cada abono, y usar el dato real es lo que impide que
     * esta cifra y la del recibo se contradigan.
     */
    const abonado = await this.prisma.payment.aggregate({
      where: { noteId: note.id },
      _sum: { appliedToOrdinaryInterestCents: true },
    });
    const ordinarioAbonado = abonado._sum.appliedToOrdinaryInterestCents ?? 0n;

    /*
     * Las cuotas que quedan. Lo abonado se reparte en cascada sobre la tabla, y
     * el interés ordinario ya cobrado se imputa igual: primero a lo más viejo,
     * que es el orden con el que el deudor entiende su deuda.
     */
    const cuotas = vivo
      ? applyToSchedule(
          note.installments.length > 0
            ? note.installments.map((cuota) => ({
                index: cuota.index,
                dueOn: cuota.dueOn.toISOString().slice(0, 10),
                amountCents: cuota.amountCents,
                interestCents: cuota.interestCents,
                principalCents: cuota.principalCents,
              }))
            : /* Pago único: el título entero es su única cuota. */
              [
                {
                  index: 1,
                  dueOn: note.dueDate.toISOString().slice(0, 10),
                  amountCents: note.amountCents,
                  interestCents: note.planInterestCents ?? 0n,
                  principalCents: note.planPrincipalCents ?? note.amountCents,
                },
              ],
          note.paidCents,
        )
      : [];

    let ordinarioPorImputar = ordinarioAbonado;
    const pending: PendingInstallment[] = cuotas.map((cuota) => {
      const cubierto =
        ordinarioPorImputar >= cuota.interestCents ? cuota.interestCents : ordinarioPorImputar;
      ordinarioPorImputar -= cubierto;
      return {
        index: cuota.index,
        dueDate: cuota.dueOn,
        amountCents: cuota.amountCents,
        paidCents: cuota.paidCents,
        interestCents: cuota.interestCents,
        interestPaidCents: cubierto,
      };
    });

    const planModel = (note.planModel ?? 'NONE') as PlanModel;
    const liquidacion = settleEarly({ model: planModel, onDate, pending });

    /*
     * El moratorio corre cuota por cuota: cada una tenía su día y arrastra sus
     * propios días de atraso. Y no corre sobre el interés ordinario de la cuota
     * (ADR 0020), que sería interés sobre interés.
     */
    let lateInterest = 0n;
    for (const cuota of pending) {
      const resta = cuota.amountCents - cuota.paidCents;
      if (resta <= 0n) continue;
      const atraso = Math.max(0, daysBetween(cuota.dueDate, onDate));
      if (atraso === 0) continue;
      lateInterest += accrueInterest({
        balanceCents: lateInterestBase({
          balanceCents: resta,
          ordinaryInterestPendingCents: pendingOrdinaryInterest({
            planInterestCents: cuota.interestCents,
            appliedCents: cuota.interestPaidCents ?? 0n,
            balanceCents: resta,
          }),
          overPrincipalOnly: settings?.lateInterestOverPrincipalOnly ?? true,
        }),
        annualRatePct: note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct),
        daysOverdue: atraso,
        basis,
      });
    }

    const total = liquidacion.payoffCents + lateInterest;
    // Seguir el calendario cuesta todo lo que queda de las cuotas, interés
    // futuro incluido: es contra esa cifra que se mide el ahorro.
    const scheduleTotal =
      pending.reduce((suma, c) => suma + (c.amountCents > c.paidCents ? c.amountCents - c.paidCents : 0n), 0n) +
      lateInterest;

    return {
      onDate,
      planModel,
      pendingCount: liquidacion.pendingCount,
      dueCount: liquidacion.dueCount,
      principal: money(liquidacion.principalCents),
      interestDue: money(liquidacion.interestDueCents),
      saved: money(liquidacion.savedCents),
      lateInterest: money(lateInterest),
      total: money(total),
      scheduleTotal: money(scheduleTotal),
      summary: resumen(liquidacion.pendingCount, planModel, liquidacion.savedCents, total, onDate),
    };
  }
}

function resumen(
  pendientes: number,
  model: PlanModel,
  ahorro: bigint,
  total: bigint,
  onDate: string,
): string {
  if (pendientes === 0) return 'No queda nada por liquidar: la deuda está saldada.';

  const fecha = LONG_DATE.format(new Date(`${onDate}T00:00:00Z`));
  const cuotas = pendientes === 1 ? 'la cuota que queda' : `las ${pendientes} cuotas que quedan`;

  if (model === 'INSOLUTOS' && ahorro > 0n) {
    return (
      `Si liquida ${cuotas} el ${fecha} paga ${formatMxn(total)} y se ahorra ` +
      `${formatMxn(ahorro)} de interés: se pactó sobre saldos insolutos, así que el interés ` +
      'que no transcurre no se cobra.'
    );
  }
  if (model === 'GLOBAL') {
    return (
      `Si liquida ${cuotas} el ${fecha} paga ${formatMxn(total)}. El interés se pactó sobre el ` +
      'importe original —saldo global—, así que adelantar el pago no lo reduce.'
    );
  }
  return `Si liquida ${cuotas} el ${fecha} paga ${formatMxn(total)}.`;
}
