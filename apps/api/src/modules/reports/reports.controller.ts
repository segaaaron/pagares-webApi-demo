import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { PortfolioReportUseCase } from './application/portfolio-report.use-case.js';
import { WorkQueueUseCase } from './application/work-queue.use-case.js';
import { OperationalReportsUseCase } from './application/operational-reports.use-case.js';
import { AccountingExportUseCase } from './application/accounting-export.use-case.js';
import { BalanceCheckUseCase } from './application/balance-check.use-case.js';

@Controller({ path: 'admin/reports', version: '1' })
@Roles('ADMIN')
export class ReportsController {
  constructor(
    private readonly portfolio: PortfolioReportUseCase,
    private readonly queues: WorkQueueUseCase,
    private readonly operational: OperationalReportsUseCase,
    private readonly accounting: AccountingExportUseCase,
    private readonly balances: BalanceCheckUseCase,
  ) {}

  /** Bandeja de trabajo: lo que requiere acción hoy (§19.2). */
  @Get('work-queue')
  async workQueue(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    return this.queues.execute(
      {},
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }

  /** Cartera vigente vs. vencida y antigüedad de saldos (§17.2). */
  @Get('portfolio')
  async portfolioReport(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    return this.portfolio.execute(
      {},
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }

  /**
   * Comprobación de saldos contra el libro de abonos (§22.5). Va antes de
   * `:report` por lo mismo que la exportación contable: si no, la captura el
   * comodín.
   */
  @Get('balance-check')
  async balanceCheck(
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.balances.execute(
      {},
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }

  /**
   * Exportación contable de cartera y abonos (§17.2).
   *
   * Va **antes** de `:report` a propósito: Nest resuelve por orden de
   * declaración y, puesta después, esta ruta la habría capturado el comodín y
   * "accounting" sería un reporte que no existe.
   */
  @Get('accounting')
  async accountingExport(
    @Query('kind') kind: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.accounting.execute(
      {
        kind: kind === 'payments' ? 'payments' : 'portfolio',
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
      },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }

  /** Los siete reportes operativos de §17.2, con la misma forma de respuesta. */
  @Get(':report')
  async report(
    @Param('report') report: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.operational.execute(
      { report, from, to },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }
}
