import 'server-only';
import type { NoteSummary, Paginated } from '@pagares/contracts';

export interface NotesPage extends Paginated<NoteSummary> {
  counts: { total: number; overdue: number };
}
import { api } from '@/shared/api/client';
export { TABS, type TabId } from './tab-list';


export async function listNotes(params: URLSearchParams): Promise<NotesPage> {
  const query = new URLSearchParams();
  // Los nombres en la URL están en español; el contrato usa from/to.
  const mapping: Record<string, string> = { desde: 'from', hasta: 'to' };
  for (const key of [
    'tab',
    'q',
    'bucket',
    'desde',
    'hasta',
    'dueFrom',
    'dueTo',
    'cursor',
    'limit',
  ] as const) {
    const value = params.get(key);
    if (value) query.set(mapping[key] ?? key, value);
  }
  return api<NotesPage>(`/admin/notes?${query.toString()}`, { tags: ['notes'] });
}
