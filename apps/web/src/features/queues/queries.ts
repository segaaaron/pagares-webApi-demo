import 'server-only';
import { api } from '@/shared/api/client';

export interface QueueItem {
  noteId: string;
  folio: string;
  debtorName: string;
  debtorPhone: string;
  balance: string;
  dueDate: string;
  daysOverdue: number;
  detail?: string;
}

export interface WorkQueues {
  dueToday: QueueItem[];
  brokenPromises: QueueItem[];
  unattended: QueueItem[];
  pendingSignature: QueueItem[];
  noChannel: QueueItem[];
  prescribing: QueueItem[];
  /** Ya pasó el plazo del art. 165: se puede cobrar, ya no demandar. */
  prescribed: QueueItem[];
}

export async function getWorkQueues(): Promise<WorkQueues> {
  return api<WorkQueues>('/admin/reports/work-queue');
}
