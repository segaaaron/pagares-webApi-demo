import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, describeRate } from '@pagares/domain-rules';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/ports/report.repository.js';

export interface AccountingExportInput {
  kind: 'portfolio' | 'payments';
  from?: string | undefined;
  to?: string | undefined;
}

export interface AccountingExport {
  title: string;
  kind: 'portfolio' | 'payments';
  range: { from: string; to: string };
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string>[];
}

/**
 * Exportación contable de cartera y abonos (§17.2).
 *
 * Se distingue de los nueve reportes en una cosa: **no agrega nada**. La
 * contabilidad no necesita saber cuánto se recuperó este mes, necesita las filas
 * para cuadrarlas contra sus pólizas, y un total redondeado no se cuadra.
 *
 * Los importes van en pesos con dos decimales y punto —no con formato de moneda—
 * porque el destino es una hoja de cálculo: "$25,000.00 MXN" entra como texto y
 * no suma.
 */
@Injectable()
export class AccountingExportUseCase extends BaseUseCase<AccountingExportInput, AccountingExport> {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repo: ReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(AccountingExportUseCase.name));
  }

  protected async handle(
    input: AccountingExportInput,
    _ctx: ExecutionContext,
  ): Promise<AccountingExport> {
    const today = businessToday(this.clock.now());
    const range = {
      from: input.from ?? `${today.slice(0, 7)}-01`,
      to: input.to ?? today,
    };

    if (input.kind === 'portfolio') {
      const rows = await this.repo.portfolioLedger();
      return {
        title: 'Exportación contable · cartera al corte',
        kind: 'portfolio',
        range: { from: today, to: today },
        columns: [
          { key: 'folio', label: 'Folio' },
          { key: 'deudor', label: 'Deudor' },
          { key: 'estado', label: 'Estado' },
          { key: 'emision', label: 'Emisión' },
          { key: 'vencimiento', label: 'Vencimiento' },
          { key: 'importe', label: 'Importe', numeric: true },
          { key: 'abonado', label: 'Abonado', numeric: true },
          { key: 'saldo', label: 'Saldo', numeric: true },
          { key: 'tasa', label: 'Tasa moratoria' },
        ],
        rows: rows.map((row) => ({
          folio: row.folio,
          deudor: row.debtorName,
          estado: row.status,
          emision: row.issueDate,
          vencimiento: row.dueDate,
          importe: pesos(row.amountCents),
          abonado: pesos(row.paidCents),
          saldo: pesos(row.amountCents - row.paidCents),
          tasa: describeRate(row.interestRateAnnualPct, 'ANNUAL'),
        })),
      };
    }

    const rows = await this.repo.paymentsLedger(range.from, range.to);
    return {
      title: 'Exportación contable · abonos del periodo',
      kind: 'payments',
      range,
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'folio', label: 'Folio' },
        { key: 'deudor', label: 'Deudor' },
        { key: 'importe', label: 'Importe', numeric: true },
        // Dos columnas y no una: la ganancia del préstamo y la sanción por
        // atraso no se contabilizan igual, y sumarlas obliga a deshacerlo a
        // mano en la hoja (ADR 0020).
        { key: 'interes_prestamo', label: 'A interés del préstamo', numeric: true },
        { key: 'interes_moratorio', label: 'A interés moratorio', numeric: true },
        { key: 'capital', label: 'A capital', numeric: true },
        { key: 'forma', label: 'Forma de pago' },
        { key: 'referencia', label: 'Referencia' },
        { key: 'tipo', label: 'Tipo' },
      ],
      rows: rows.map((row) => ({
        fecha: row.paidOn,
        folio: row.folio,
        deudor: row.debtorName,
        importe: pesos(row.amountCents),
        interes_prestamo: pesos(row.ordinaryInterestCents),
        interes_moratorio: pesos(row.interestCents),
        capital: pesos(row.principalCents),
        forma: row.method,
        referencia: row.reference ?? '',
        // La condonación va nombrada: en una póliza contable no es cobranza,
        // es pérdida, y quien cuadre la hoja necesita distinguirlas (§25.16).
        tipo: row.isReversal
          ? 'Reversa'
          : row.isWaiver
            ? 'Condonación'
            : row.isRecovery
              ? 'Recuperación de castigo'
              : 'Abono',
      })),
    };
  }
}

/** Centavos a pesos con punto decimal: lo que una hoja de cálculo sí suma. */
function pesos(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
