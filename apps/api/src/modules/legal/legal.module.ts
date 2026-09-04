import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller.js';
import { RegisterCustodyEventUseCase } from './application/register-custody-event.use-case.js';

@Module({
  controllers: [LegalController],
  providers: [RegisterCustodyEventUseCase],
})
export class LegalModule {}
