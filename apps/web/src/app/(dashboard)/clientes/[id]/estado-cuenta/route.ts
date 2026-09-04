import { NextResponse } from 'next/server';
import { readSession } from '@/shared/auth/session';
import { fetchConLimite, PLAZO } from '@/shared/lib/fetch-con-limite';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** Estado de cuenta del cliente en PDF (§17.1). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { id } = await params;
  const upstream = await fetchConLimite(`${API_URL}/api/v1/admin/debtors/${id}/statement`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  },
  // Un pagaré con firma o un paquete de cien PDFs se generan al momento (§17.1).
  PLAZO.documento,
  );

  if (!upstream.ok) {
    const destino = new URL(`/clientes/${id}`, request.url);
    destino.searchParams.set('aviso', 'estado-cuenta-fallido');
    return NextResponse.redirect(destino);
  }

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="estado-cuenta-${id}.pdf"`,
    },
  });
}
