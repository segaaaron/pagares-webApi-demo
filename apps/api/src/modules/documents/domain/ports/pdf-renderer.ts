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
  /** Moratorio, como se pactó: «3% mensual». */
  interestRateLabel: string;
  /**
   * El interés **ordinario** cuando el pagaré es cuota de un plan (§12).
   *
   * No es un adorno: las tasas pactadas —ordinaria y moratoria— tienen que
   * constar en el título para poder exigirse. Sin esto, el documento sólo
   * hablaba del moratorio y el precio del préstamo viajaba escondido dentro
   * del importe.
   */
  plan: {
    /** «Pago 3 de 12». */
    positionLabel: string;
    rateLabel: string;
    /** Cómo se calcula el interés: sobre saldos insolutos o sobre el original. */
    modelLabel: string;
    interestFormatted: string;
    principalFormatted: string;
  } | null;
  /** Qué es hoy el documento: sirve para marcarlo si aún no obliga a nadie. */
  status: string;
  /**
   * Los abonos anotados en el título (art. 17 LGTOC).
   *
   * El tenedor anota en el propio pagaré los pagos parciales que recibe. Sin
   * esa anotación, quien tenga el papel puede cobrar dos veces lo mismo, y el
   * deudor que ya pagó no tiene con qué defenderse.
   */
  payments: { dateFormatted: string; amountFormatted: string }[];
  paidFormatted: string;
  balanceFormatted: string;
  /** Dónde se comprueba que este papel corresponde a un pagaré real. */
  verifyUrl: string | null;
  /** El mismo enlace como código QR (PNG en base64), para leerlo del papel. */
  verifyQrBase64: string | null;
  /** Días base del interés: 360 o 365. Sin la base, la tasa no se puede recalcular. */
  interestBasis: number;
  /** Lo que se sabe de la captura de la firma, para el bloque de evidencia. */
  signatureEvidence: {
    deviceModel: string | null;
    strokeCount: number | null;
    durationMs: number | null;
    mode: string;
  } | null;
  /** Cuándo se generó esta copia. Un PDF sin fecha no se puede contrastar. */
  issuedAtFormatted: string;
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
  /** Contacto al pie: a quién llamar si el documento genera dudas. */
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;

  debtorName: string;
  amountFormatted: string;
  amountInWords: string;
  appliedToInterest: string;
  /** El precio del préstamo, aparte de la sanción por atraso (ADR 0020). */
  appliedToOrdinaryInterest: string;
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
  /** Contacto al pie: a quién llamar si el documento genera dudas. */
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;
  debtorName: string;
  amountFormatted: string;
  /** El importe también en letra: así lo lee un finiquito. */
  amountInWords?: string;
  settledOnFormatted: string;
  issuedAtFormatted: string;
  place: string;
}

export interface StatementModelPort {
  statementFolio: string;
  organizationName: string;
  organizationAddress: string;
  /** Contacto al pie: a quién llamar si el documento genera dudas. */
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;
  debtorName: string;
  debtorPhone?: string | null | undefined;
  cutoffFormatted: string;
  issuedAtFormatted?: string;
  /** Lo vencido, aparte: es la cifra por la que se llama. */
  overdueCount?: number;
  overdueBalance?: string;
  notes: {
    folio: string;
    issueDate: string;
    dueDate: string;
    amount: string;
    paid: string;
    balance: string;
    statusLabel: string;
    daysOverdue?: number;
  }[];
  totalBalance: string;
  totalPaid: string;
}

export interface EvidenceModelPort {
  noteFolio: string;
  organizationName: string;
  organizationAddress: string;
  /** Contacto al pie: a quién llamar si el documento genera dudas. */
  organizationPhone?: string | null | undefined;
  organizationEmail?: string | null | undefined;

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
