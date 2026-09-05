import 'server-only';
import { api } from '@/shared/api/client';
import type { NoteStatus } from '@/entities/note/status';

export interface NoteDetail {
  id: string;
  folio: string;
  status: NoteStatus;
  portfolioClass: string;
  agingBucket: string;
  daysOverdue: number;
  issuePlace: string;
  issueDate: string;
  paymentPlace: string;
  dueDate: string;
  prescribesOn: string | null;
  creditorName: string;
  amount: { cents: string; formatted: string };
  paid: { cents: string; formatted: string };
  balance: { cents: string; formatted: string };
  accruedInterest: { cents: string; formatted: string };
  interestRateAnnualPct: number | null;
  /** Como se pactó: «3% mensual». Es lo que va en el documento. */
  interestRateLabel: string;
  /** Con la equivalencia anual simple, para la columna de operación. */
  interestRateOperationalLabel: string;
  negotiable: boolean;
  guarantors: {
    position: number;
    fullName: string;
    address: string;
    phone: string;
  }[];
  /**
   * De qué está hecha esta cuota cuando el pagaré es parte de un plan (§12).
   * Nulo cuando no lleva interés dentro.
   */
  breakdown: {
    model: string;
    interest: { cents: string; formatted: string };
    principal: { cents: string; formatted: string };
    interestPending: { cents: string; formatted: string };
  } | null;
  /** La serie, cuando la deuda se documentó en varios pagos (§12). */
  series: {
    id: string;
    index: number;
    size: number;
    notes: {
      id: string;
      folio: string;
      index: number;
      status: NoteStatus;
      dueDate: string;
      amount: { cents: string; formatted: string };
      balance: { cents: string; formatted: string };
    }[];
  } | null;
  interestPeriod: 'MONTHLY' | 'ANNUAL';
  amountInWords: string;
  observations: string | null;
  debtor: { id: string; fullName: string; address: string; phone: string; email: string | null };
  signature: {
    url: string;
    sha256: string;
    capturedAt: string;
    mode: string;
    deviceModel: string | null;
    strokeCount: number | null;
    durationMs: number | null;
  } | null;
  payments: {
    id: string;
    amount: string;
    /** Moratorio: la sanción por el atraso (§12.3). */
    appliedToInterest: string;
    /** Interés ordinario: el precio del préstamo (§12, ADR 0020). */
    appliedToOrdinaryInterest: string;
    appliedToPrincipal: string;
    paidOn: string;
    method: string;
    reference: string | null;
    isReversal: boolean;
    isWaiver: boolean;
    registeredBy: string;
  }[];
  allowedTransitions: NoteStatus[];
  settlement: { id: string; agreed: string; forgiven: string; dueOn: string; status: string } | null;
  legalCase: { id: string; fileNumber: string | null; courtName: string | null; openedOn: string } | null;
  physicalDocumentLocation: string | null;
  inLitigation: boolean;
  activities: {
    id: string;
    type: string;
    outcome: string;
    promisedOn: string | null;
    notes: string | null;
    createdAt: string;
  }[];
  audit: { id: string; action: string; actorRole: string; createdAt: string; metadata: unknown }[];
}

export async function getNote(id: string): Promise<NoteDetail> {
  return api<NoteDetail>(`/admin/notes/${id}`);
}
