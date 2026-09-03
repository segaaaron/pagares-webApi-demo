import { Module } from '@nestjs/common';
import { PDF_RENDERER } from './domain/ports/pdf-renderer.js';
import { ReactPdfRenderer } from './infrastructure/react-pdf.renderer.js';
import { RenderNotePdfUseCase } from './application/render-note-pdf.use-case.js';
import { DocumentsController, DebtorDocumentsController } from './documents.controller.js';
import {
  RenderReceiptUseCase,
  RenderReleaseUseCase,
  RenderStatementUseCase,
  RenderEvidenceUseCase,
} from './application/render-documents.use-case.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { NOTE_DOCUMENTS } from '../../shared/domain/note-documents.port.js';
import { NoteDocumentsAdapter } from './infrastructure/note-documents.adapter.js';
import { ARCHIVE_BUILDER } from './domain/ports/archive-builder.js';
import { ArchiverArchiveBuilder } from './infrastructure/archiver.archive-builder.js';
import { BuildLegalPackageUseCase } from './application/legal-package.use-case.js';
import { BundleNotesUseCase } from './application/bundle-notes.use-case.js';
import { DocumentsBundleController } from './bundle.controller.js';

@Module({
  controllers: [DocumentsController, DebtorDocumentsController, DocumentsBundleController],
  providers: [
    { provide: PDF_RENDERER, useClass: ReactPdfRenderer },
    RenderNotePdfUseCase,
    RenderReceiptUseCase,
    RenderReleaseUseCase,
    RenderStatementUseCase,
    RenderEvidenceUseCase,
    NumberingService,
    { provide: NOTE_DOCUMENTS, useClass: NoteDocumentsAdapter },
    { provide: ARCHIVE_BUILDER, useClass: ArchiverArchiveBuilder },
    BuildLegalPackageUseCase,
    BundleNotesUseCase,
  ],
  exports: [
    RenderNotePdfUseCase,
    RenderReceiptUseCase,
    RenderReleaseUseCase,
    RenderStatementUseCase,
    NOTE_DOCUMENTS,
  ],
})
export class DocumentsModule {}
