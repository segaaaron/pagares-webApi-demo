/**
 * Puerto de documentos para quien los adjunta, no para quien los dibuja.
 *
 * Vive en `shared/domain` porque lo usan dos módulos —`notifications` los
 * adjunta, `documents` los produce— y colgarlo de cualquiera de los dos obligaría
 * al otro a importar su interior, que es exactamente lo que prohíbe §3.2.
 */
export interface RenderedDocument {
  filename: string;
  content: Buffer;
}

export interface NoteDocuments {
  /** El pagaré, para el correo 6 (§16). */
  note(noteId: string): Promise<RenderedDocument>;
  /** Recibo de un abono, para el correo 15. */
  receipt(paymentId: string): Promise<RenderedDocument>;
  /** Estado de cuenta de un deudor, para el correo 16. */
  statement(debtorId: string): Promise<RenderedDocument>;
  /** Carta de finiquito, para el correo 17. */
  release(noteId: string): Promise<RenderedDocument>;
}

export const NOTE_DOCUMENTS = Symbol('NoteDocuments');
