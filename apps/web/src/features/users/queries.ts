import 'server-only';
import { api } from '@/shared/api/client';

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'CLIENT';
  status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  lockedUntil: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  notesCount: number;
  /** Dispositivos desde los que ha entrado, del más reciente al más antiguo. */
  devices: { platform: string; lastSeenAt: string }[];
  createdAt: string;
}

export async function listUsers(): Promise<UserRow[]> {
  return api<UserRow[]>('/admin/users');
}
