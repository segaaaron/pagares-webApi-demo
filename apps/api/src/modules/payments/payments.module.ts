import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { BalanceController } from './balance.controller.js';
import { VoidPaymentUseCase } from './application/void-payment.use-case.js';
import { RegisterPaymentUseCase } from './application/register-payment.use-case.js';
import { RecalculateBalanceUseCase } from './application/recalculate-balance.use-case.js';
import { ForgiveRemainderUseCase } from './application/forgive-remainder.use-case.js';

@Module({
  controllers: [PaymentsController, BalanceController],
  providers: [
    VoidPaymentUseCase,
    RegisterPaymentUseCase,
    RecalculateBalanceUseCase,
    ForgiveRemainderUseCase,
  ],
  exports: [VoidPaymentUseCase, RegisterPaymentUseCase, ForgiveRemainderUseCase],
})
export class PaymentsModule {}
