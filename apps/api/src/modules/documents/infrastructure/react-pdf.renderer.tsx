import { Injectable } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import type {
  NoteDocumentModel,
  PdfRenderer,
  ReceiptModelPort,
  ReleaseModelPort,
  StatementModelPort,
  EvidenceModelPort,
} from '../domain/ports/pdf-renderer.js';
import { NoteDocument } from './note-document.js';
import { ReceiptDocument } from './receipt-document.js';
import { ReleaseDocument } from './release-document.js';
import { StatementDocument } from './statement-document.js';
import { EvidenceDocument } from './evidence-document.js';

/**
 * Renderizador de PDF (§17.1). Se eligió `@react-pdf/renderer` sobre Puppeteer:
 * ~2 MB frente a +300 MB de imagen Docker, medio segundo frente a 2–5 s, y sin
 * depender de una versión de Chromium que cambia el resultado entre despliegues.
 */
@Injectable()
export class ReactPdfRenderer implements PdfRenderer {
  async renderNote(model: NoteDocumentModel): Promise<Buffer> {
    return renderToBuffer(<NoteDocument model={model} />);
  }

  async renderReceipt(model: ReceiptModelPort): Promise<Buffer> {
    return renderToBuffer(<ReceiptDocument model={model} />);
  }

  async renderRelease(model: ReleaseModelPort): Promise<Buffer> {
    return renderToBuffer(<ReleaseDocument model={model} />);
  }

  async renderStatement(model: StatementModelPort): Promise<Buffer> {
    return renderToBuffer(<StatementDocument model={model} />);
  }

  async renderEvidence(model: EvidenceModelPort): Promise<Buffer> {
    return renderToBuffer(<EvidenceDocument model={model} />);
  }
}
