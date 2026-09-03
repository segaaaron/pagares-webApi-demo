import { Module } from '@nestjs/common';
import { SignaturesController } from './signatures.controller.js';
import { SignNoteUseCase } from './application/sign-note.use-case.js';

@Module({ controllers: [SignaturesController], providers: [SignNoteUseCase] })
export class SignaturesModule {}
