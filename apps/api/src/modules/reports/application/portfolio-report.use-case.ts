import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, formatMxn, OVERDUE_PORTFOLIO_THRESHOLD_DAYS } from '@pagares/domain-rules';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/ports/report.repository.js';

/** Meses del eje, en español y sin punto: caben en una etiqueta de gráfica. */
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface AgingBucketRow {
  bucket: string;
  label: string;
  count: number;
  balanceCents: string;
  balanceFormatted: string;
}

export interface PortfolioReport {
  asOf: string;
  totals: {
    outstandingCents: string;
    outstandingFormatted: string;
    overdueCents: string;
    overdueFormatted: string;
    /** Cartera vencida contable: 90 días naturales, no un día de atraso. */
    nonPerformingCents: string;
    nonPerformingFormatted: string;
    collectedThisMonthCents: string;
    collectedThisMonthFormatted: string;
    activeNotes: number;
    overdueNotes: number;
    /** Vencen en los próximos 7 días: lo que hay que cobrar esta semana. */
    dueSoonNotes: number;
    dueSoonCents: string;
    dueSoonFormatted: string;
  };
  aging: AgingBucketRow[];
  /** Doce meses de cobrado y colocado, para la gráfica de evolución. */
  flow: MonthlyFlowPoint[];
  /** Reparto del saldo vivo entre vigente, por vencer, vencido y convenio. */
  mix: MixSlice[];
}

export interface MonthlyFlowPoint {
  month: string;
  /** "sep 26": etiqueta corta para el eje, ya en español. */
  label: string;
  collectedCents: string;
  issuedCents: string;
  collectedFormatted: string;
  issuedFormatted: string;
}

export interface MixSlice {
  key: 'current' | 'dueSoon' | 'overdue' | 'settlement';
  label: string;
  count: number;
  balanceCents: string;
  balanceFormatted: string;
}

const BUCKETS: { bucket: string; label: string; from: number; to: number }[] = [
  { bucket: 'CURRENT', label: 'Al corriente', from: -36_500, to: 0 },
  { bucket: 'D1_30', label: '1 a 30 días', from: 1, to: 30 },
  { bucket: 'D31_60', label: '31 a 60 días', from: 31, to: 60 },
  { bucket: 'D61_90', label: '61 a 90 días', from: 61, to: 90 },
  { bucket: 'D91_120', label: '91 a 120 días', from: 91, to: 120 },
  { bucket: 'D120_PLUS', label: 'Más de 120 días', from: 121, to: 36_500 },
];

const DAY_MS = 86_400_000;

/**
 * Cartera y antigüedad de saldos (§17.2, reportes 1 y 2).
 *
 * Todo se calcula por rango de fechas sobre el saldo vivo, no sobre columnas
 * precalculadas: sin trabajo diario que las refresque, esas columnas mentirían.
 */
@Injectable()
export class PortfolioReportUseCase extends BaseUseCase<Record<string, never>, PortfolioReport> {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(PortfolioReportUseCase.name));
  }

  protected async handle(_input: Record<string, never>, _ctx: ExecutionContext): Promise<PortfolioReport> {
    const now = this.clock.now();
    const today = businessToday(now);
    const todayDate = new Date(`${today}T00:00:00Z`);

    const open = await this.reports.openBalances();

    let outstanding = 0n;
    let overdue = 0n;
    let nonPerforming = 0n;
    let overdueNotes = 0;
    let dueSoonNotes = 0;
    let dueSoon = 0n;
    let onTimeNotes = 0;
    let onTime = 0n;
    let settlementNotes = 0;
    let settlement = 0n;
    const byBucket = new Map<string, { count: number; balance: bigint }>();

    for (const note of open) {
      const balance = note.amountCents - note.paidCents;
      if (balance <= 0n) continue;

      const dueTime = Date.parse(`${note.dueDate}T00:00:00Z`);
      const days = Math.max(0, Math.round((todayDate.getTime() - dueTime) / DAY_MS));

      outstanding += balance;
      // Vencido excluye los que están en convenio: su estado derivado es
      // RESTRUCTURED, y así este indicador cuadra con la pestaña "Vencidos".
      if (days > 0 && !note.inSettlement) {
        overdue += balance;
        overdueNotes += 1;
      }
      // Cartera vencida sí los incluye: a los 90 días el riesgo es el mismo
      // haya convenio o no, igual que en la pestaña "Cartera vencida".
      if (days >= OVERDUE_PORTFOLIO_THRESHOLD_DAYS) nonPerforming += balance;

      const daysToDue = Math.round((dueTime - todayDate.getTime()) / DAY_MS);
      if (daysToDue >= 0 && daysToDue <= 7 && !note.inSettlement) {
        dueSoonNotes += 1;
        dueSoon += balance;
      }

      // Las cuatro rebanadas son excluyentes y en este orden: un pagaré en
      // convenio no se cuenta además como vencido (§11.2).
      if (note.inSettlement) {
        settlementNotes += 1;
        settlement += balance;
      } else if (days > 0) {
        // Ya sumado arriba como vencido.
      } else if (daysToDue <= 7) {
        // Ya sumado arriba como "vence pronto".
      } else {
        onTimeNotes += 1;
        onTime += balance;
      }

      const bucket = BUCKETS.find((b) => days >= b.from && days <= b.to) ?? BUCKETS[0]!;
      const current = byBucket.get(bucket.bucket) ?? { count: 0, balance: 0n };
      byBucket.set(bucket.bucket, { count: current.count + 1, balance: current.balance + balance });
    }

    // Cobrado del mes: suma de abonos vigentes, reversas incluidas con su signo.
    const collected = await this.reports.collectedSince(`${today.slice(0, 7)}-01`);

    // Once meses atrás más el actual: un año de gráfica sin arrastrar histórico.
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - 11);
    const flowRows = await this.reports.monthlyFlow(first.toISOString().slice(0, 7));
    const byMonth = new Map(flowRows.map((r) => [r.month, r]));

    const flow: MonthlyFlowPoint[] = [];
    for (let i = 0; i < 12; i += 1) {
      const cursor = new Date(first);
      cursor.setUTCMonth(cursor.getUTCMonth() + i);
      const month = cursor.toISOString().slice(0, 7);
      // Los meses sin movimiento también van: un hueco en el eje se lee como
      // "no hay dato", y lo que hubo fue cero.
      const row = byMonth.get(month) ?? { collectedCents: 0n, issuedCents: 0n };
      flow.push({
        month,
        label: `${MONTHS[cursor.getUTCMonth()]!} ${String(cursor.getUTCFullYear()).slice(2)}`,
        collectedCents: row.collectedCents.toString(),
        issuedCents: row.issuedCents.toString(),
        collectedFormatted: formatMxn(row.collectedCents),
        issuedFormatted: formatMxn(row.issuedCents),
      });
    }

    const mix: MixSlice[] = (
      [
        { key: 'current', label: 'Al corriente', count: onTimeNotes, balance: onTime },
        { key: 'dueSoon', label: 'Vence en 7 días', count: dueSoonNotes, balance: dueSoon },
        { key: 'overdue', label: 'Vencido', count: overdueNotes, balance: overdue },
        { key: 'settlement', label: 'En convenio', count: settlementNotes, balance: settlement },
      ] as const
    ).map(({ balance, ...rest }) => ({
      ...rest,
      balanceCents: balance.toString(),
      balanceFormatted: formatMxn(balance),
    }));

    return {
      asOf: today,
      totals: {
        outstandingCents: outstanding.toString(),
        outstandingFormatted: formatMxn(outstanding),
        overdueCents: overdue.toString(),
        overdueFormatted: formatMxn(overdue),
        nonPerformingCents: nonPerforming.toString(),
        nonPerformingFormatted: formatMxn(nonPerforming),
        collectedThisMonthCents: collected.toString(),
        collectedThisMonthFormatted: formatMxn(collected),
        activeNotes: open.length,
        overdueNotes,
        dueSoonNotes,
        dueSoonCents: dueSoon.toString(),
        dueSoonFormatted: formatMxn(dueSoon),
      },
      flow,
      mix,
      aging: BUCKETS.map((b) => {
        const row = byBucket.get(b.bucket) ?? { count: 0, balance: 0n };
        return {
          bucket: b.bucket,
          label: b.label,
          count: row.count,
          balanceCents: row.balance.toString(),
          balanceFormatted: formatMxn(row.balance),
        };
      }),
    };
  }
}
