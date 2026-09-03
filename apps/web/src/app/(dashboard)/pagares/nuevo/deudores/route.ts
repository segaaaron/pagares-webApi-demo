import { NextResponse } from 'next/server';
import { api } from '@/shared/api/client';
import { readSession } from '@/shared/auth/session';

interface DebtorRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  address?: string;
  activeCount: number;
  overdueCount: number;
  behavior: string;
}

/**
 * Buscador de deudores para la emisión.
 *
 * Vive aquí y no en el cliente porque el token de sesión es `httpOnly`: el
 * navegador no puede llamar a la API por su cuenta. Este handler comprueba la
 * sesión, llama con el token y devuelve sólo lo que el selector pinta.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  // Menos de dos letras devolvería medio directorio y ninguna respuesta útil.
  if (q.length < 2) return NextResponse.json({ results: [] });

  const rows = await api<DebtorRow[]>(`/admin/debtors?q=${encodeURIComponent(q)}`);
  return NextResponse.json({ results: rows.slice(0, 8) });
}
