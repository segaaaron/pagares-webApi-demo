import 'server-only';
import { api } from '@/shared/api/client';

export type CustodyKind = 'RECEIVED' | 'MOVED' | 'HANDED_OVER' | 'RETURNED' | 'LOST';

export interface CustodyEvent {
  id: string;
  kind: CustodyKind;
  occurredOn: string;
  location: string;
  holder: string;
  handedTo: string | null;
  notes: string | null;
}

export interface CustodyLog {
  currentLocation: string | null;
  currentHolder: string | null;
  /** Liquidado y el papel sigue con nosotros: art. 129 LGTOC. */
  pendingReturn: boolean;
  events: CustodyEvent[];
}

/**
 * La bitácora de custodia del documento físico (§13.6).
 *
 * Que no se pueda leer no debe tumbar el detalle del pagaré: es información
 * lateral, y el resto de la pantalla sirve igual sin ella.
 */
export async function getCustodyLog(noteId: string): Promise<CustodyLog> {
  try {
    return await api<CustodyLog>(`/admin/notes/${noteId}/custody`);
  } catch {
    return { currentLocation: null, currentHolder: null, pendingReturn: false, events: [] };
  }
}
