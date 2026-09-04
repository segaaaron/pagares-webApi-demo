import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import {
  accrueInterest,
  businessToday,
  daysBetween,
  describeRateWithAnnual,
  formatMxn,
} from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';

export interface SimulateSettlementInput {
  noteId: string;
  /** Fecha civil del pago hipotético. Por omisión, hoy. */
  onDate?: string | undefined;
}

export interface SettlementSimulation {
  folio: string;
  onDate: string;
  daysOverdue: number;
  principal: { cents: string; formatted: string };
  interest: { cents: string; formatted: string };
  total: { cents: string; formatted: string };
  interestRateLabel: string;
  /** Un convenio vigente cambia la respuesta: manda el monto convenido (§13.4). */
  settlement: { agreed: string; forgiven: string; dueOn: string; status: string } | null;
  /** Qué decirle al deudor, ya redactado, para no traducir cifras a mano. */
  summary: string;
}

const LONG_DATE = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Simulador de liquidación (§24.5): "si paga el 15 de octubre, debe $X".
 *
 * El interés moratorio corre por día natural (§12.3), así que la pregunta del
 * deudor —cuánto debo si pago tal día— no se contesta con el saldo de hoy. Esto
 * existe para no sacar la calculadora y decirle un número equivocado, que
 * después hay que sostener o desdecir.
 *
 * **No** guarda nada ni congela la cifra: es una consulta. Si el deudor paga
 * otro día, el número es otro, y eso es lo correcto.
 */
@Injectable()
export class SimulateSettlementUseCase extends BaseUseCase<
  SimulateSettlementInput,
  SettlementSimulation
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(SimulateSettlementUseCase.name));
  }

  protected async handle(
    input: SimulateSettlementInput,
    _ctx: ExecutionContext,
  ): Promise<SettlementSimulation> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      include: {
        settlements: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');
    if (note.status === 'VOID' || note.status === 'RENEWED') {
      // Un anulado no se debe y un renovado se debe en el documento nuevo:
      // dar una cifra aquí sería invitar a cobrar lo que no toca (§13.7).
      throw new BadRequestException(
        note.status === 'VOID'
          ? 'El pagaré está anulado: no hay nada que liquidar'
          : 'El pagaré fue renovado: la liquidación se calcula sobre el documento nuevo',
      );
    }

    const today = businessToday(this.clock.now());
    const onDate = input.onDate ?? today;
    if (daysBetween(today, onDate) < 0) {
      // Simular hacia atrás daría una cifra que ya no se puede cobrar: el
      // interés de los días transcurridos no se devuelve.
      throw new BadRequestException('La fecha de la simulación no puede ser anterior a hoy');
    }

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
    });
    const dueDate = note.dueDate.toISOString().slice(0, 10);
    const overdueAtDate = Math.max(0, daysBetween(dueDate, onDate));

    const principal = note.amountCents - note.paidCents;
    const rate = note.interestRateAnnualPct === null ? null : Number(note.interestRateAnnualPct);
    const interest = accrueInterest({
      balanceCents: principal,
      annualRatePct: rate,
      daysOverdue: overdueAtDate,
      basis: (settings?.interestBasis ?? 360) as 360 | 365,
    });
    const total = principal + interest;

    const active = note.settlements[0];
    const dateLabel = LONG_DATE.format(new Date(`${onDate}T00:00:00Z`));

    const summary = principal <= 0n
      ? 'El pagaré ya está liquidado: no queda nada por cobrar.'
      : active
      ? `Hay un convenio vigente por ${formatMxn(active.agreedCents)} con fecha límite ` +
        `${LONG_DATE.format(active.dueOn)}. Mientras esté vigente, esa es la cifra a cobrar.`
      : overdueAtDate > 0
        ? `Si paga el ${dateLabel} debe ${formatMxn(total)}: ${formatMxn(principal)} de capital ` +
          `más ${formatMxn(interest)} de interés por ${overdueAtDate} días de atraso.`
        : `Si paga el ${dateLabel} debe ${formatMxn(total)}. Todavía no hay interés moratorio.`;

    return {
      folio: note.folio,
      onDate,
      daysOverdue: overdueAtDate,
      principal: { cents: principal.toString(), formatted: formatMxn(principal) },
      interest: { cents: interest.toString(), formatted: formatMxn(interest) },
      total: { cents: total.toString(), formatted: formatMxn(total) },
      // El simulador explica de dónde sale el interés: aquí la equivalencia
      // anual simple es justo lo que hace entendible la cuenta.
      interestRateLabel: describeRateWithAnnual(rate, note.interestPeriod),
      settlement: active
        ? {
            agreed: formatMxn(active.agreedCents),
            forgiven: formatMxn(active.forgivenCents),
            dueOn: active.dueOn.toISOString().slice(0, 10),
            status: active.status,
          }
        : null,
      summary,
    };
  }
}
