import type { AgingBucket, CollectionStage, NoteStatus } from '@pagares/contracts';

/** Fila cruda del listado, en términos del dominio y sin tipos del ORM. */
export interface NoteListRow {
  id: string;
  folio: string;
  status: NoteStatus;
  collectionStage: CollectionStage;
  debtorName: string;
  /** Nulo si el deudor se dio de alta sin teléfono. */
  debtorPhone: string | null;
  amountCents: bigint;
  paidCents: bigint;
  dueDate: string;
  signatureThumbKey: string | null;
  /** `PAPER` es firmado sin trazo digital: cuenta como firmado (§24.5). */
  signatureMode: 'REMOTE' | 'IN_PERSON' | 'PAPER' | null;
}

export interface NoteListQuery {
  tab: string;
  q?: string | undefined;
  bucket?: AgingBucket | undefined;
  from?: string | undefined;
  /** Por fecha de vencimiento, no de emisión. */
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
  to?: string | undefined;
  limit: number;
  cursor?: { value: string; id: string } | undefined;
  /** Fecha civil de hoy en la zona del negocio: los tramos son rangos de fechas. */
  today: string;
}

/**
 * Puerto de lectura de la cartera. El caso de uso pide filas; cómo se traducen
 * las pestañas y los tramos a SQL es asunto del adaptador.
 */
export interface NoteCounts {
  /** Cuántos coinciden con el filtro aplicado, no cuántos hay en total. */
  total: number;
  overdue: number;
}

export interface NoteRepository {
  list(query: NoteListQuery): Promise<NoteListRow[]>;
  count(query: NoteListQuery): Promise<NoteCounts>;
}

export const NOTE_REPOSITORY = Symbol('NoteRepository');
