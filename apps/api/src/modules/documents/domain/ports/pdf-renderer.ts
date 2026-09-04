export type DocumentType = 'note' | 'receipt' | 'statement' | 'release' | 'evidence';

/** Datos ya presentados: el renderizador no formatea ni calcula (§17.1). */
export interface NoteDocumentModel {
  folio: string;
  organizationName: string;
  organizationAddress: string;
  /** Contacto al pie: a quién llamar si el documento genera dudas. */
  organizationPhone: string | null;
  organizationEmail: string | null;
  creditorName: string;
  amountFormatted: string;
  amountInWords: string;
  currency: string;
  issuePlace: string;
  issueDateFormatted: string;
  paymentPlace: string;
  dueDateFormatted: string;
  interestRateLabel: string;
  /**
   * Si el título circula por endoso (art. 25 LGTOC). Cuando es falso, el
   * documento lleva la cláusula "no a la orden" y deja de transmitirse por
   * endoso: sólo por cesión, y el suscriptor conserva sus defensas.
   */
  negotiable: boolean;
  observations: string | null;
  debtor: { fullName: string; address: string; phone: string };
  /**
   * Avales, hasta dos. Van en el documento con su propio bloque de firma: el
   * aval responde igual que el suscriptor (arts. 109-116 LGTOC, aplicables al
   * pagaré por el 174), y sin su firma en el papel no queda obligado.
   */
  guarantors: {
    position: number;
    fullName: string;
    address: string;
    phone: string;
    signaturePngBase64: string | null;
    signedAtFormatted: string | null;
  }[];
  /** PNG en base64: @react-pdf no admite WebP, así que se convierte antes. */
  signaturePngBase64: string | null;
  signatureCapturedAt: string | null;
  signatureSha256: string | null;
}

/**
 * Puerto de renderizado. Hoy lo implementa `@react-pdf/renderer`; si algún día
 * el diseño supera lo que permite, se añade otro adaptador sin tocar los casos
 * de uso (§17.1).
 */
export interface ReceiptModelPort {
  receiptFolio: string;
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  debtorName: string;
  amountFormatted: string;
  amountInWords: string;
  appliedToInterest: string;
  appliedToPrincipal: string;
  balanceAfter: string;
  paidOnFormatted: string;
  methodLabel: string;
  reference: string | null;
  issuedAtFormatted: string;
}

export interface ReleaseModelPort {
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  debtorName: string;
  amountFormatted: string;
  settledOnFormatted: string;
  issuedAtFormatted: string;
  place: string;
}

export interface StatementModelPort {
  statementFolio: string;
  organizationName: string;
  organizationAddress: string;
  debtorName: string;
  cutoffFormatted: string;
  notes: {
    folio: string;
    issueDate: string;
    dueDate: string;
    amount: string;
    paid: string;
    balance: string;
    statusLabel: string;
  }[];
  totalBalance: string;
  totalPaid: string;
}

export interface EvidenceModelPort {
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  debtorName: string;
  amountFormatted: string;
  documentSha256: string;
  signatureSha256: string;
  capturedAtFormatted: string;
  acceptedAtFormatted: string | null;
  scrolledToEndAtFormatted: string | null;
  mode: 'REMOTE' | 'IN_PERSON' | 'PAPER';
  enabledByLabel: string | null;
  ipAddress: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  inputType: string | null;
  strokeCount: number | null;
  durationMs: number | null;
  issuedAtFormatted: string;
}

export interface PdfRenderer {
  renderNote(model: NoteDocumentModel): Promise<Buffer>;
  renderReceipt(model: ReceiptModelPort): Promise<Buffer>;
  renderRelease(model: ReleaseModelPort): Promise<Buffer>;
  renderStatement(model: StatementModelPort): Promise<Buffer>;
  renderEvidence(model: EvidenceModelPort): Promise<Buffer>;
}

export const PDF_RENDERER = Symbol('PdfRenderer');
