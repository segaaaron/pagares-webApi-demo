import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { PortfolioReportUseCase } from './application/portfolio-report.use-case.js';
import { WorkQueueUseCase } from './application/work-queue.use-case.js';
import { OperationalReportsUseCase } from './application/operational-reports.use-case.js';
import { AccountingExportUseCase } from './application/accounting-export.use-case.js';
import { BalanceCheckUseCase } from './application/balance-check.use-case.js';
import { REPORT_REPOSITORY } from './domain/ports/report.repository.js';
import { PrismaReportRepository } from './infrastructure/prisma-report.repository.js';

@Module({
  controllers: [ReportsController],
  providers: [
    PortfolioReportUseCase,
    WorkQueueUseCase,
    OperationalReportsUseCase,
    AccountingExportUseCase,
    BalanceCheckUseCase,
    { provide: REPORT_REPOSITORY, useClass: PrismaReportRepository },
  ],
})
export class ReportsModule {}
