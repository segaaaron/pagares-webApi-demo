import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller.js';
import { NoteImportsController } from './imports.controller.js';
import { ImportNotesUseCase } from './application/import-notes.use-case.js';
import { IssueNoteUseCase } from './application/issue-note.use-case.js';
import { ListNotesUseCase } from './application/list-notes.use-case.js';
import { GetNoteDetailUseCase } from './application/get-note-detail.use-case.js';
import { SimulateSettlementUseCase } from './application/simulate-settlement.use-case.js';
import { SimulateEarlyPayoffUseCase } from './application/simulate-early-payoff.use-case.js';
import { ChangeNoteStatusUseCase } from './application/change-note-status.use-case.js';
import { ExtendNoteUseCase } from './application/extend-note.use-case.js';
import { RenewNoteUseCase } from './application/renew-note.use-case.js';
import { CreateSettlementUseCase } from '../settlements/application/create-settlement.use-case.js';
import { CloseSettlementUseCase } from '../settlements/application/close-settlement.use-case.js';
import { VoidPaymentUseCase } from '../payments/application/void-payment.use-case.js';
import { SignNoteUseCase } from '../signatures/application/sign-note.use-case.js';
import { RegisterPaymentUseCase } from '../payments/application/register-payment.use-case.js';
import { ForgiveRemainderUseCase } from '../payments/application/forgive-remainder.use-case.js';
import { NoteFactory } from './application/note-factory.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { NOTE_REPOSITORY } from './domain/ports/note.repository.js';
import { PrismaNoteRepository } from './infrastructure/prisma-note.repository.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  // De aquí sale la cuenta de acceso del deudor al emitir (§25.2).
  imports: [UsersModule],
  controllers: [NotesController, NoteImportsController],
  providers: [
    IssueNoteUseCase,
    ListNotesUseCase,
    GetNoteDetailUseCase,
    SimulateSettlementUseCase,
    SimulateEarlyPayoffUseCase,
    ImportNotesUseCase,
    ChangeNoteStatusUseCase,
    ExtendNoteUseCase,
    RenewNoteUseCase,
    CreateSettlementUseCase,
    CloseSettlementUseCase,
    VoidPaymentUseCase,
    RegisterPaymentUseCase,
    // Lo usa NotesController, así que vive aquí como sus dos hermanos: este
    // módulo no importa PaymentsModule, provee las tres piezas por su cuenta.
    ForgiveRemainderUseCase,
    SignNoteUseCase,
    NumberingService,
    // La única puerta por la que nace un pagaré (§11, §12): la usan la emisión,
    // la renovación y la importación.
    NoteFactory,
    { provide: NOTE_REPOSITORY, useClass: PrismaNoteRepository },
  ],
})
export class PromissoryNotesModule {}
