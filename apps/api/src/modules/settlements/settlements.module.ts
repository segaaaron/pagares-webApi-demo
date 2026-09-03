import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller.js';
import { CloseSettlementUseCase } from './application/close-settlement.use-case.js';
import { CreateSettlementUseCase } from './application/create-settlement.use-case.js';

@Module({
  controllers: [SettlementsController],
  providers: [CloseSettlementUseCase, CreateSettlementUseCase],
  exports: [CloseSettlementUseCase, CreateSettlementUseCase],
})
export class SettlementsModule {}
