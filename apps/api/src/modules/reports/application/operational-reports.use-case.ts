import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, formatMxn } from '@pagares/domain-rules';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/ports/report.repository.js';

export interface DateRange {
  from: string;
  to: string;
}

export interface ReportRow {
  label: string;
  value: string;
  detail?: string;
}

export interface OperationalReport {
  title: string;
  range: DateRange;
  summary: ReportRow[];
  rows: Record<string, string>[];
  columns: { key: string; label: string; numeric?: boolean }[];
}

/**
 * Los siete reportes operativos de §17.2.
 *
 * Comparten forma —resumen arriba, tabla abajo— para que el front los pinte con
 * un solo componente y añadir uno nuevo no exija pantalla nueva.
 */
@Injectable()
export class OperationalReportsUseCase extends BaseUseCase<
  { report: string; from?: string | undefined; to?: string | undefined },
  OperationalReport
> {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repo: ReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(OperationalReportsUseCase.name));
  }

  protected async handle(
    input: { report: string; from?: string | undefined; to?: string | undefined },
    _ctx: ExecutionContext,
  ): Promise<OperationalReport> {
    const today = businessToday(this.clock.now());
    // Por defecto, el mes en curso: es el periodo que se consulta el 90 % de las veces.
    const range: DateRange = {
      from: input.from ?? `${today.slice(0, 7)}-01`,
      to: input.to ?? today,
    };

    switch (input.report) {
      case 'issued':
        return this.issued(range);
      case 'collected':
        return this.settled(range);
      case 'recovery':
        return this.recovery(range);
      case 'written-off':
        return this.writtenOff(range);
      case 'settlements':
        return this.settlements(range);
      case 'activity':
        return this.activity(range);
      case 'concentration':
        return this.concentration(range);
      default:
        // Sin este corte, un nombre mal escrito devolvía otro reporte sin avisar.
        throw new NotFoundException(`No existe el reporte "${input.report}"`);
    }
  }

  private async issued(range: DateRange): Promise<OperationalReport> {
    const rows = await this.repo.issuedBetween(range.from, range.to);
    let total = 0n;
    for (const r of rows) total += r.amountCents;

    return {
      title: 'Colocado por periodo',
      range,
      summary: [
        { label: 'Pagarés emitidos', value: String(rows.length) },
        { label: 'Importe colocado', value: formatMxn(total) },
      ],
      columns: [
        { key: 'folio', label: 'Folio' },
        { key: 'debtorName', label: 'Deudor' },
        { key: 'issueDate', label: 'Expedido' },
        { key: 'amount', label: 'Importe', numeric: true },
      ],
      rows: rows.map((r) => ({
        folio: r.folio,
        debtorName: r.debtorName,
        issueDate: r.issueDate,
        amount: formatMxn(r.amountCents),
      })),
    };
  }

  private async settled(range: DateRange): Promise<OperationalReport> {
    const rows = await this.repo.settledBetween(range.from, range.to);
    let total = 0n;
    let days = 0;
    for (const r of rows) {
      total += r.amountCents;
      days += r.daysToSettle;
    }

    return {
      title: 'Liquidado por periodo',
      range,
      summary: [
        { label: 'Pagarés liquidados', value: String(rows.length) },
        { label: 'Importe recuperado', value: formatMxn(total) },
        {
          label: 'Días promedio hasta liquidar',
          value: rows.length ? String(Math.round(days / rows.length)) : '—',
          detail: 'Desde la expedición hasta el último abono',
        },
      ],
      columns: [
        { key: 'folio', label: 'Folio' },
        { key: 'debtorName', label: 'Deudor' },
        { key: 'settledOn', label: 'Liquidado' },
        { key: 'daysToSettle', label: 'Días', numeric: true },
        { key: 'amount', label: 'Importe', numeric: true },
      ],
      rows: rows.map((r) => ({
        folio: r.folio,
        debtorName: r.debtorName,
        settledOn: r.settledOn,
        daysToSettle: String(r.daysToSettle),
        amount: formatMxn(r.amountCents),
      })),
    };
  }

  private async recovery(range: DateRange): Promise<OperationalReport> {
    const payments = await this.repo.paymentsBetween(range.from, range.to);

    let interest = 0n;
    let principal = 0n;
    let recovered = 0n;
    const byDay = new Map<string, bigint>();

    for (const p of payments) {
      interest += p.interestCents;
      principal += p.principalCents;
      // La recuperación de castigos es un renglón propio: no es cobranza normal.
      if (p.isRecovery) recovered += p.amountCents;
      byDay.set(p.paidOn, (byDay.get(p.paidOn) ?? 0n) + p.amountCents);
    }

    return {
      title: 'Recuperación del periodo',
      range,
      summary: [
        { label: 'Total cobrado', value: formatMxn(interest + principal) },
        { label: 'Aplicado a capital', value: formatMxn(principal) },
        { label: 'Aplicado a intereses', value: formatMxn(interest) },
        {
          label: 'Recuperación de castigos',
          value: formatMxn(recovered),
          detail: 'Abonos sobre pagarés dados de baja contablemente',
        },
      ],
      columns: [
        { key: 'day', label: 'Día' },
        { key: 'amount', label: 'Cobrado', numeric: true },
      ],
      rows: [...byDay.entries()].map(([day, amount]) => ({ day, amount: formatMxn(amount) })),
    };
  }

  private async writtenOff(range: DateRange): Promise<OperationalReport> {
    const rows = await this.repo.writtenOff();
    let total = 0n;
    let recovered = 0n;
    for (const r of rows) {
      total += r.writtenOffCents;
      recovered += r.recoveredCents;
    }

    return {
      title: 'Cartera castigada y recuperada',
      range,
      summary: [
        { label: 'Pagarés castigados', value: String(rows.length) },
        { label: 'Importe castigado', value: formatMxn(total) },
        {
          label: 'Recuperado después',
          value: formatMxn(recovered),
          detail: 'Castigar no es perdonar: la deuda sigue siendo exigible',
        },
      ],
      columns: [
        { key: 'folio', label: 'Folio' },
        { key: 'debtorName', label: 'Deudor' },
        { key: 'writtenOffAt', label: 'Castigado' },
        { key: 'reason', label: 'Motivo' },
        { key: 'amount', label: 'Importe', numeric: true },
        { key: 'recovered', label: 'Recuperado', numeric: true },
      ],
      rows: rows.map((r) => ({
        folio: r.folio,
        debtorName: r.debtorName,
        writtenOffAt: r.writtenOffAt,
        reason: r.reason ?? '—',
        amount: formatMxn(r.writtenOffCents),
        recovered: formatMxn(r.recoveredCents),
      })),
    };
  }

  private async settlements(range: DateRange): Promise<OperationalReport> {
    const rows = await this.repo.settlements();
    const counts = { ACTIVE: 0, FULFILLED: 0, BROKEN: 0 };
    let forgiven = 0n;

    for (const r of rows) {
      counts[r.status as keyof typeof counts] += 1;
      if (r.status === 'FULFILLED') forgiven += r.forgivenCents;
    }

    return {
      title: 'Convenios',
      range,
      summary: [
        { label: 'Vigentes', value: String(counts.ACTIVE) },
        { label: 'Cumplidos', value: String(counts.FULFILLED) },
        { label: 'Incumplidos', value: String(counts.BROKEN) },
        {
          label: 'Quitas otorgadas',
          value: formatMxn(forgiven),
          detail: 'Sólo de convenios cumplidos: la quita de uno roto no se aplica',
        },
      ],
      columns: [
        { key: 'folio', label: 'Folio' },
        { key: 'debtorName', label: 'Deudor' },
        { key: 'status', label: 'Estado' },
        { key: 'dueOn', label: 'Vence' },
        { key: 'agreed', label: 'Convenido', numeric: true },
        { key: 'forgiven', label: 'Quita', numeric: true },
      ],
      rows: rows.map((r) => ({
        folio: r.folio,
        debtorName: r.debtorName,
        status: r.status === 'ACTIVE' ? 'Vigente' : r.status === 'FULFILLED' ? 'Cumplido' : 'Incumplido',
        dueOn: r.dueOn,
        agreed: formatMxn(r.agreedCents),
        forgiven: formatMxn(r.forgivenCents),
      })),
    };
  }

  private async activity(range: DateRange): Promise<OperationalReport> {
    const rows = await this.repo.activitiesBetween(range.from, range.to);
    const promises = rows.filter((r) => r.outcome === 'PROMISED');
    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);

    return {
      title: 'Gestión del periodo',
      range,
      summary: [
        { label: 'Contactos registrados', value: String(rows.length) },
        { label: 'Promesas obtenidas', value: String(promises.length) },
        {
          label: 'Sin respuesta',
          value: String(rows.filter((r) => r.outcome === 'NO_ANSWER').length),
        },
      ],
      columns: [
        { key: 'type', label: 'Tipo' },
        { key: 'count', label: 'Contactos', numeric: true },
      ],
      rows: [...byType.entries()].map(([type, count]) => ({ type, count: String(count) })),
    };
  }

  private async concentration(range: DateRange): Promise<OperationalReport> {
    const rows = await this.repo.concentration();
    let total = 0n;
    for (const r of rows) total += r.balanceCents;

    const topThree = rows.slice(0, 3).reduce((n, r) => n + r.balanceCents, 0n);
    const share = total > 0n ? Number((topThree * 100n) / total) : 0;

    return {
      title: 'Concentración por deudor',
      range,
      summary: [
        { label: 'Deudores con saldo', value: String(rows.length) },
        { label: 'Saldo total', value: formatMxn(total) },
        {
          label: 'En los 3 mayores',
          value: `${share}%`,
          detail: 'Cuánto del riesgo está en pocas manos',
        },
      ],
      columns: [
        { key: 'debtorName', label: 'Deudor' },
        { key: 'notes', label: 'Pagarés', numeric: true },
        { key: 'balance', label: 'Saldo', numeric: true },
        { key: 'share', label: 'Del total', numeric: true },
      ],
      rows: rows.map((r) => ({
        debtorName: r.debtorName,
        notes: String(r.notes),
        balance: formatMxn(r.balanceCents),
        share: total > 0n ? `${Number((r.balanceCents * 100n) / total)}%` : '0%',
      })),
    };
  }
}
