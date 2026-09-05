import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import {
  accrueInterest,
  businessToday,
  daysBetween,
  formatMxn,
  lateInterestBase,
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
 * Liquidación anticipada de la serie (§12): "si paga todo hoy, ¿cuánto es?".
 *
 * La respuesta depende de cómo se pactó el interés ordinario, y por eso no hay
 * una sola: sobre **saldos insolutos** el interés es el precio del tiempo y el
 * que no transcurre no se cobra; sobre **saldo global** se pactó de una vez
 * sobre el importe original y adelantar no lo baja. La regla vive en
 * `domain-rules`; aquí sólo se reúnen las cuotas y se le pregunta.
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
    });
    if (!note) throw new NoteNotFoundError();

    const today = businessToday(this.clock.now());
    const onDate = input.onDate ?? today;
    if (daysBetween(today, onDate) < 0) throw new SimulationDateInPastError();

    /*
     * Un pagaré suelto se liquida solo; uno de una serie arrastra a sus
     * hermanos, porque liquidar es saldar la deuda, no una cuota (§12).
     */
    const hermanos = note.seriesId
      ? await this.prisma.promissoryNote.findMany({
          where: { seriesId: note.seriesId, ...(input.ownerId ? { ownerId: input.ownerId } : {}) },
          orderBy: { seriesIndex: 'asc' },
        })
      : [note];

    // Un anulado no se debe y un renovado se debe en el documento nuevo (§13.7).
    const vivos = hermanos
      .filter((n) => n.status !== 'VOID' && n.status !== 'RENEWED')
      .filter((n) => !input.signedOnly || isSigned(n.status as NoteStatus));

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
    });
    const basis = (settings?.interestBasis ?? 360) as 360 | 365;

    /*
     * Cuánto del interés ordinario de cada cuota se ha cubierto ya. Se lee del
     * libro de abonos y no se deduce del importe pagado: desde el ADR 0020 el
     * reparto queda escrito en cada abono, y usar el dato real es lo que impide
     * que esta cifra y la del recibo se contradigan.
     */
    const abonos = await this.prisma.payment.groupBy({
      by: ['noteId'],
      where: { noteId: { in: vivos.map((n) => n.id) } },
      _sum: { appliedToOrdinaryInterestCents: true },
    });
    const ordinarioAbonado = new Map(
      abonos.map((fila) => [fila.noteId, fila._sum.appliedToOrdinaryInterestCents ?? 0n]),
    );

    const pending: PendingInstallment[] = vivos.map((n) => ({
      index: n.seriesIndex ?? 1,
      dueDate: n.dueDate.toISOString().slice(0, 10),
      amountCents: n.amountCents,
      paidCents: n.paidCents,
      interestCents: n.planInterestCents ?? 0n,
      interestPaidCents: ordinarioAbonado.get(n.id) ?? 0n,
    }));

    const planModel = (note.planModel ?? 'NONE') as PlanModel;
    const liquidacion = settleEarly({ model: planModel, onDate, pending });

    // El moratorio se calcula pagaré por pagaré: cada uno venció su día y lleva
    // sus propios días de atraso.
    let lateInterest = 0n;
    for (const n of vivos) {
      const resta = n.amountCents - n.paidCents;
      if (resta <= 0n) continue;
      const atraso = Math.max(0, daysBetween(n.dueDate.toISOString().slice(0, 10), onDate));
      if (atraso === 0) continue;
      // La mora no corre sobre el interés ordinario de la cuota (ADR 0020).
      lateInterest += accrueInterest({
        balanceCents: lateInterestBase({
          balanceCents: resta,
          ordinaryInterestPendingCents:
            (n.planInterestCents ?? 0n) - (ordinarioAbonado.get(n.id) ?? 0n),
          overPrincipalOnly: settings?.lateInterestOverPrincipalOnly ?? true,
        }),
        annualRatePct: n.interestRateAnnualPct === null ? null : Number(n.interestRateAnnualPct),
        daysOverdue: atraso,
        basis,
      });
    }

    const total = liquidacion.payoffCents + lateInterest;
    // Seguir el calendario cuesta todo lo que queda de las cuotas, interés
    // futuro incluido: es contra esa cifra que se mide el ahorro.
    const scheduleTotal =
      vivos.reduce((suma, n) => suma + (n.amountCents > n.paidCents ? n.amountCents - n.paidCents : 0n), 0n) +
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
