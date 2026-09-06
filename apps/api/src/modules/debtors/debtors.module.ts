import { Module } from '@nestjs/common';
import { DebtorsController } from './debtors.controller.js';
import { DebtorImportsController } from './imports.controller.js';
import { ImportDebtorsUseCase } from './application/import-debtors.use-case.js';
import { CreateDebtorUseCase } from './application/create-debtor.use-case.js';

@Module({
  controllers: [DebtorsController, DebtorImportsController],
  providers: [ImportDebtorsUseCase, CreateDebtorUseCase],
})
export class DebtorsModule {}
