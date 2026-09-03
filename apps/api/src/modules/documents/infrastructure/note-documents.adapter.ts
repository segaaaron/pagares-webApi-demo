import { Injectable } from '@nestjs/common';
import { SYSTEM_CONTEXT } from '@pagares/api-core';
import type { NoteDocuments, RenderedDocument } from '../../../shared/domain/note-documents.port.js';
import { RenderNotePdfUseCase } from '../application/render-note-pdf.use-case.js';
import {
  RenderReceiptUseCase,
  RenderReleaseUseCase,
  RenderStatementUseCase,
} from '../application/render-documents.use-case.js';

/**
 * Adaptador del puerto `NoteDocuments`: convierte los casos de uso de este
 * módulo en algo que otro módulo puede adjuntar a un correo sin conocerlos.
 *
 * El contexto es de sistema porque el disparo es un evento, no una petición: el
 * correo del recibo sale del `PaymentRegistered`, y ahí ya no hay nadie mirando.
 */
@Injectable()
export class NoteDocumentsAdapter implements NoteDocuments {
  constructor(
    private readonly renderNote: RenderNotePdfUseCase,
    private readonly renderReceipt: RenderReceiptUseCase,
    private readonly renderStatement: RenderStatementUseCase,
    private readonly renderRelease: RenderReleaseUseCase,
  ) {}

  async note(noteId: string): Promise<RenderedDocument> {
    const content = await this.renderNote.execute({ id: noteId }, SYSTEM_CONTEXT('email'));
    return { filename: 'pagare.pdf', content };
  }

  async receipt(paymentId: string): Promise<RenderedDocument> {
    const content = await this.renderReceipt.execute({ paymentId }, SYSTEM_CONTEXT('email'));
    return { filename: 'recibo.pdf', content };
  }

  async statement(debtorId: string): Promise<RenderedDocument> {
    const content = await this.renderStatement.execute({ debtorId }, SYSTEM_CONTEXT('email'));
    return { filename: 'estado-de-cuenta.pdf', content };
  }

  async release(noteId: string): Promise<RenderedDocument> {
    const content = await this.renderRelease.execute({ noteId }, SYSTEM_CONTEXT('email'));
    return { filename: 'carta-de-finiquito.pdf', content };
  }
}
