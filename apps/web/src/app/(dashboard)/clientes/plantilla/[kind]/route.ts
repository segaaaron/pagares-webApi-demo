import { NextResponse } from 'next/server';
import { readSession } from '@/shared/auth/session';
import { csvResponse, toCsv } from '@/shared/lib/csv';

/**
 * Plantilla de importación (§24.5).
 *
 * Leer una lista de columnas y armar el archivo a mano es donde se pierde la
 * gente: sobra una columna, falta un acento, la fecha va al revés. Bajar un
 * archivo que ya tiene la cabecera y una fila de ejemplo convierte el problema
 * en «sustituye estos datos por los tuyos».
 *
 * La fila de ejemplo va dentro a propósito, y con un nombre que se reconoce como
 * ejemplo: un archivo con sólo cabeceras no enseña el formato de las fechas ni
 * el del importe, que es justo lo que se equivoca.
 */
const PLANTILLAS = {
  deudores: {
    headers: ['nombre', 'domicilio', 'telefono', 'correo', 'notas'],
    ejemplo: [
      'Juana Ejemplo Ramírez',
      'Av. Madero 412, Centro',
      '+524431112233',
      'juana@ejemplo.mx',
      'Cliente de ejemplo: borra esta fila',
    ],
  },
  pagares: {
    headers: [
      'telefono_deudor',
      'importe',
      'fecha_emision',
      'vencimiento',
      'abonado',
      'tasa',
      'periodo_tasa',
      'folio_original',
    ],
    ejemplo: [
      '+524431112233',
      '25000.00',
      '2026-01-15',
      '2026-07-15',
      '5000.00',
      '3',
      'MONTHLY',
      'Pagaré 018 del talonario',
    ],
  },
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const session = await readSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { kind } = await params;
  const plantilla = PLANTILLAS[kind as keyof typeof PLANTILLAS];
  if (!plantilla) return new NextResponse('Plantilla no reconocida', { status: 404 });

  return csvResponse(`plantilla-${kind}`, toCsv([...plantilla.headers], [[...plantilla.ejemplo]]));
}
