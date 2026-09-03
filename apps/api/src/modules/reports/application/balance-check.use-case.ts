import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { formatMxn } from '@pagares/domain-rules';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { REPORT_REPOSITORY, type ReportRepository } from '../domain/ports/report.repository.js';

export interface BalanceCheck {
  checkedAt: string;
  balanced: boolean;
  mismatches: {
    id: string;
    folio: string;
    debtorName: string;
    stored: string;
    ledger: string;
    difference: string;
  }[];
}

/**
 * Comprobación de saldos (§22.5).
 *
 * `paidCents` es una copia denormalizada para no sumar el libro en cada lectura,
 * y una copia se puede desviar: un abono escrito fuera de su transacción, una
 * corrección a mano en la base. La verdad son las filas del libro, así que esto
 * compara las dos y enseña la diferencia.
 *
 * **No corrige nada.** Un descuadre puede venir de un abono que falta o de uno
 * que sobra, y ajustar el saldo en silencio taparía justamente el problema que
 * hay que mirar (§7).
 */
@Injectable()
export class BalanceCheckUseCase extends BaseUseCase<Record<string, never>, BalanceCheck> {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly repo: ReportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(BalanceCheckUseCase.name));
  }

  protected async handle(
    _input: Record<string, never>,
    _ctx: ExecutionContext,
  ): Promise<BalanceCheck> {
    const rows = await this.repo.balanceMismatches();

    return {
      checkedAt: this.clock.now().toISOString(),
      balanced: rows.length === 0,
      mismatches: rows.map((row) => ({
        id: row.id,
        folio: row.folio,
        debtorName: row.debtorName,
        stored: formatMxn(row.storedPaidCents),
        ledger: formatMxn(row.ledgerPaidCents),
        difference: formatMxn(row.storedPaidCents - row.ledgerPaidCents),
      })),
    };
  }
}
