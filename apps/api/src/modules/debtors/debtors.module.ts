import { Module } from '@nestjs/common';
import { DebtorsController } from './debtors.controller.js';
import { DebtorImportsController } from './imports.controller.js';
import { ImportDebtorsUseCase } from './application/import-debtors.use-case.js';

@Module({
  controllers: [DebtorsController, DebtorImportsController],
  providers: [ImportDebtorsUseCase],
})
export class DebtorsModule {}
