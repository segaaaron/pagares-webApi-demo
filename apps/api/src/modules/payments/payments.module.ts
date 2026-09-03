import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { BalanceController } from './balance.controller.js';
import { VoidPaymentUseCase } from './application/void-payment.use-case.js';
import { RegisterPaymentUseCase } from './application/register-payment.use-case.js';
import { RecalculateBalanceUseCase } from './application/recalculate-balance.use-case.js';

@Module({
  controllers: [PaymentsController, BalanceController],
  providers: [VoidPaymentUseCase, RegisterPaymentUseCase, RecalculateBalanceUseCase],
  exports: [VoidPaymentUseCase, RegisterPaymentUseCase],
})
export class PaymentsModule {}
