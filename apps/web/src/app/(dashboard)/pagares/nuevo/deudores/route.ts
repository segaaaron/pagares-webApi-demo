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
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  // Menos de dos letras devolvería medio directorio y ninguna respuesta útil.
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const rows = await api<DebtorRow[]>(`/admin/debtors?q=${encodeURIComponent(q)}`);
    return NextResponse.json({ results: rows.slice(0, 8) });
  } catch {
    // El buscador vive dentro del formulario de emisión: que no encuentre a
    // nadie es molesto, pero tumbar la pantalla a medio capturar un pagaré es
    // perder el trabajo de quien lo estaba escribiendo.
    return NextResponse.json({ results: [], unavailable: true });
  }
}
