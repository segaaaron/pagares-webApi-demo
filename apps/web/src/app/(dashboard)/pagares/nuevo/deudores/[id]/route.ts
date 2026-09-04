import { NextResponse } from 'next/server';
import { api } from '@/shared/api/client';
import { readSession } from '@/shared/auth/session';

interface DebtorDetail {
  id: string;
  lastGuarantors?: { position: number; fullName: string; address: string; phone: string }[];
}

/**
 * Los avales del último pagaré de un deudor, para el que se está emitiendo.
 *
 * El buscador devuelve lo justo para elegir a la persona; esto se pide sólo
 * cuando ya se eligió, que es cuando importa. Como el token vive en una cookie
 * `httpOnly`, la llamada tiene que pasar por aquí.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ guarantors: [] }, { status: 401 });
  }

  const { id } = await params;
  try {
    const debtor = await api<DebtorDetail>(`/admin/debtors/${id}`);
    return NextResponse.json({ guarantors: debtor.lastGuarantors ?? [] });
  } catch {
    // Sin avales previos se emite igual: no es motivo para detener nada.
    return NextResponse.json({ guarantors: [] });
  }
}
