import { NextResponse } from 'next/server';
import { readSession } from '@/shared/auth/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** Estado de cuenta del cliente en PDF (§17.1). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const upstream = await fetch(`${API_URL}/api/v1/admin/debtors/${id}/statement`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: 'No se pudo generar el estado de cuenta' }, { status: upstream.status });
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="estado-cuenta-${id}.pdf"`,
    },
  });
}
