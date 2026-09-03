import { Injectable } from '@nestjs/common';
import type { NoteStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import type {
  BalanceMismatchRow,
  LedgerNoteRow,
  LedgerPaymentRow,
  MonthlyFlowRow,
  ActivityRow,
  ConcentrationRow,
  IssuedRow,
  OpenBalanceRow,
  RecoveryRow,
  ReportRepository,
  SettledRow,
  SettlementRow,
  WrittenOffRow,
} from '../domain/ports/report.repository.js';

// Sin OVERDUE a propósito: ese estado se deriva al leer y nunca se guarda (§11.2).
const OPEN_STATUSES: NoteStatus[] = ['ISSUED', 'PARTIALLY_PAID', 'RESTRUCTURED'];

@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async openBalances(): Promise<OpenBalanceRow[]> {
    const rows = await this.prisma.promissoryNote.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: { amountCents: true, paidCents: true, dueDate: true, status: true },
    });
    return rows.map((r) => ({
      amountCents: r.amountCents,
      paidCents: r.paidCents,
      dueDate: r.dueDate.toISOString().slice(0, 10),
      inSettlement: r.status === 'RESTRUCTURED',
    }));
  }

  async collectedSince(from: string): Promise<bigint> {
    const result = await this.prisma.payment.aggregate({
      where: { paidOn: { gte: new Date(`${from}T00:00:00Z`) } },
      _sum: { amountCents: true },
    });
    return result._sum.amountCents ?? 0n;
  }

  /**
   * Doce meses caben en dos consultas agrupadas; hacer una por mes serían
   * veinticuatro viajes a la base para pintar una gráfica.
   *
   * El agrupado va en SQL porque `date_trunc` respeta la zona de negocio y
   * agrupar en memoria obligaría a traerse todos los abonos del año.
   */
  async monthlyFlow(fromMonth: string): Promise<MonthlyFlowRow[]> {
    const from = new Date(`${fromMonth}-01T00:00:00Z`);

    const [collected, issued] = await Promise.all([
      this.prisma.$queryRaw<{ month: Date; total: bigint }[]>`
        SELECT date_trunc('month', "paidOn") AS month, SUM("amountCents")::bigint AS total
        FROM "Payment"
        WHERE "paidOn" >= ${from}
        GROUP BY 1 ORDER BY 1
      `,
      this.prisma.$queryRaw<{ month: Date; total: bigint }[]>`
        SELECT date_trunc('month', "issueDate") AS month, SUM("amountCents")::bigint AS total
        FROM "PromissoryNote"
        WHERE "issueDate" >= ${from} AND "status" <> 'VOID'
        GROUP BY 1 ORDER BY 1
      `,
    ]);

    const key = (d: Date): string => d.toISOString().slice(0, 7);
    const byMonth = new Map<string, { collectedCents: bigint; issuedCents: bigint }>();
    for (const row of collected) {
      byMonth.set(key(row.month), { collectedCents: row.total, issuedCents: 0n });
    }
    for (const row of issued) {
      const current = byMonth.get(key(row.month)) ?? { collectedCents: 0n, issuedCents: 0n };
      byMonth.set(key(row.month), { ...current, issuedCents: row.total });
    }

    return [...byMonth.entries()]
      .map(([month, sums]) => ({ month, ...sums }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async issuedBetween(from: string, to: string): Promise<IssuedRow[]> {
    const rows = await this.prisma.promissoryNote.findMany({
      where: {
        issueDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        // Lo anulado no se colocó: incluirlo inflaría la cifra.
        status: { not: 'VOID' },
      },
      orderBy: { issueDate: 'desc' },
      select: { folio: true, issueDate: true, amountCents: true, debtor: { select: { fullName: true } } },
    });
    return rows.map((r) => ({
      folio: r.folio,
      issueDate: r.issueDate.toISOString().slice(0, 10),
      amountCents: r.amountCents,
      debtorName: r.debtor.fullName,
    }));
  }

  async settledBetween(from: string, to: string): Promise<SettledRow[]> {
    const rows = await this.prisma.promissoryNote.findMany({
      where: {
        status: 'PAID',
        payments: { some: { paidOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } } },
      },
      include: {
        debtor: { select: { fullName: true } },
        payments: { orderBy: { paidOn: 'desc' }, take: 1 },
      },
    });

    return rows.map((r) => {
      const settledOn = r.payments[0]?.paidOn ?? r.updatedAt;
      return {
        folio: r.folio,
        dueDate: r.dueDate.toISOString().slice(0, 10),
        settledOn: settledOn.toISOString().slice(0, 10),
        amountCents: r.amountCents,
        // Días entre expedición y liquidación: cuánto tarda en cobrarse.
        daysToSettle: Math.round((settledOn.getTime() - r.issueDate.getTime()) / 86_400_000),
        debtorName: r.debtor.fullName,
      };
    });
  }

  async paymentsBetween(from: string, to: string): Promise<RecoveryRow[]> {
    const rows = await this.prisma.payment.findMany({
      where: { paidOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { paidOn: 'asc' },
    });
    return rows.map((r) => ({
      paidOn: r.paidOn.toISOString().slice(0, 10),
      amountCents: r.amountCents,
      interestCents: r.appliedToInterestCents,
      principalCents: r.appliedToPrincipalCents,
      isRecovery: r.isRecovery,
    }));
  }

  async writtenOff(): Promise<WrittenOffRow[]> {
    const rows = await this.prisma.promissoryNote.findMany({
      where: { status: 'WRITTEN_OFF' },
      include: { debtor: { select: { fullName: true } }, payments: { where: { isRecovery: true } } },
      orderBy: { writtenOffAt: 'desc' },
    });

    return rows.map((r) => {
      let recovered = 0n;
      for (const p of r.payments) recovered += p.amountCents;
      return {
        folio: r.folio,
        debtorName: r.debtor.fullName,
        writtenOffAt: r.writtenOffAt?.toISOString().slice(0, 10) ?? '',
        reason: r.writeOffReason,
        writtenOffCents: r.amountCents - r.paidCents + recovered,
        recoveredCents: recovered,
      };
    });
  }

  async settlements(): Promise<SettlementRow[]> {
    const rows = await this.prisma.settlement.findMany({
      include: { note: { include: { debtor: { select: { fullName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      folio: r.note.folio,
      debtorName: r.note.debtor.fullName,
      status: r.status,
      agreedCents: r.agreedCents,
      forgivenCents: r.forgivenCents,
      dueOn: r.dueOn.toISOString().slice(0, 10),
    }));
  }

  async activitiesBetween(from: string, to: string): Promise<ActivityRow[]> {
    const rows = await this.prisma.collectionActivity.findMany({
      where: { createdAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59Z`) } },
    });
    return rows.map((r) => ({
      type: r.type,
      outcome: r.outcome,
      promisedOn: r.promisedOn?.toISOString().slice(0, 10) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async concentration(): Promise<ConcentrationRow[]> {
    const debtors = await this.prisma.debtor.findMany({
      include: {
        promissoryNotes: {
          where: { status: { in: OPEN_STATUSES } },
          select: { amountCents: true, paidCents: true },
        },
      },
    });

    return debtors
      .map((d) => {
        let balance = 0n;
        for (const n of d.promissoryNotes) balance += n.amountCents - n.paidCents;
        return { debtorName: d.fullName, balanceCents: balance, notes: d.promissoryNotes.length };
      })
      .filter((r) => r.balanceCents > 0n)
      .sort((a, b) => (b.balanceCents > a.balanceCents ? 1 : -1));
  }

  /**
   * Cartera al corte, fila por pagaré. No excluye los castigados: en
   * contabilidad el castigo es un renglón, no una desaparición (§13.7).
   */
  async portfolioLedger(): Promise<LedgerNoteRow[]> {
    const rows = await this.prisma.promissoryNote.findMany({
      where: { status: { notIn: ['VOID', 'RENEWED'] } },
      orderBy: [{ dueDate: 'asc' }],
      select: {
        folio: true,
        status: true,
        issueDate: true,
        dueDate: true,
        amountCents: true,
        paidCents: true,
        interestRateAnnualPct: true,
        debtor: { select: { fullName: true } },
      },
    });

    return rows.map((row) => ({
      folio: row.folio,
      debtorName: row.debtor.fullName,
      status: row.status,
      issueDate: row.issueDate.toISOString().slice(0, 10),
      dueDate: row.dueDate.toISOString().slice(0, 10),
      amountCents: row.amountCents,
      paidCents: row.paidCents,
      interestRateAnnualPct:
        row.interestRateAnnualPct === null ? null : Number(row.interestRateAnnualPct),
    }));
  }

  /**
   * Abonos del periodo, con las reversas y su signo. El libro es de anexar
   * (§12.2), así que la exportación enseña las dos filas: el abono y su reversa.
   */
  async paymentsLedger(from: string, to: string): Promise<LedgerPaymentRow[]> {
    const rows = await this.prisma.payment.findMany({
      where: { paidOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59Z`) } },
      orderBy: [{ paidOn: 'asc' }],
      include: { note: { select: { folio: true, debtor: { select: { fullName: true } } } } },
    });

    return rows.map((row) => ({
      folio: row.note.folio,
      debtorName: row.note.debtor.fullName,
      paidOn: row.paidOn.toISOString().slice(0, 10),
      amountCents: row.amountCents,
      interestCents: row.appliedToInterestCents,
      principalCents: row.appliedToPrincipalCents,
      method: row.method,
      reference: row.reference,
      isReversal: row.amountCents < 0n,
      reversalOfId: row.reversalOfId,
      isRecovery: row.isRecovery,
    }));
  }

  /**
   * La comprobación de §22.5, en una sola consulta.
   *
   * Se hace en SQL y no trayendo la cartera al proceso porque es una suma por
   * pagaré sobre toda la tabla: en memoria costaría una consulta por pagaré y
   * nadie la ejecutaría dos veces.
   */
  async balanceMismatches(): Promise<BalanceMismatchRow[]> {
    /*
     * `SUM(bigint)` en Postgres devuelve `numeric`, y Prisma lo entrega como
     * Decimal o cadena, no como BigInt. Se convierte a mano: mezclarlo con el
     * `paidCents` —que sí es BigInt— revienta con "Cannot mix BigInt and other
     * types" en cuanto hay una fila.
     */
    const rows = await this.prisma.$queryRaw<
      { id: string; folio: string; debtorName: string; stored: bigint; ledger: unknown }[]
    >`
      SELECT n.id,
             n.folio,
             d."fullName" AS "debtorName",
             n."paidCents" AS stored,
             COALESCE(SUM(p."amountCents"), 0) AS ledger
      FROM "PromissoryNote" n
      JOIN "Debtor" d ON d.id = n."debtorId"
      LEFT JOIN "Payment" p ON p."noteId" = n.id
      GROUP BY n.id, n.folio, d."fullName", n."paidCents"
      HAVING n."paidCents" <> COALESCE(SUM(p."amountCents"), 0)
      ORDER BY n.folio`;

    return rows.map((row) => ({
      id: row.id,
      folio: row.folio,
      debtorName: row.debtorName,
      storedPaidCents: BigInt(row.stored),
      ledgerPaidCents: row.ledger === null ? 0n : BigInt(String(row.ledger)),
    }));
  }
}
