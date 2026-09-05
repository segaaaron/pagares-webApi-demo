import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { DebtorHasUnsignedNoteError } from '../domain/note.errors.js';

/**
 * Llave del cerrojo que serializa la emisión por deudor.
 *
 * Sin él, dos altas a la vez leen las dos que no hay nada pendiente y emiten
 * las dos: la regla sería un adorno. Se toma por teléfono, así que no estorba a
 * nadie más (§12).
 */
const ISSUE_LOCK = 776_2;

/** El teléfono es la identidad del deudor a efectos de esta regla. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}

/**
 * Nada nuevo mientras quede algo sin firmar (ADR 0019).
 *
 * La regla es para quien quiere **sumar** pagarés: un título sin firma no
 * obliga al deudor —es una petición, no una deuda—, así que apilarle otro
 * encima acumula papeles que no valen y deja al administrador sin saber qué
 * aceptó de verdad.
 *
 * Se busca por **teléfono** y no por ficha: el correo es opcional, así que
 * volver a teclear al mismo deudor creaba una ficha nueva sin nada pendiente y
 * la regla se saltaba sola. Unir las fichas por teléfono se descartó —dos
 * personas que comparten línea acabarían con el pagaré de una a nombre de la
 * otra—, así que cada ficha sigue siendo de quien es.
 *
 * `exceptNoteId` existe para la renovación: el pagaré que se sustituye no
 * cuenta contra sí mismo, porque renovar no suma un título, lo cambia por otro.
 */
export async function assertNothingUnsigned(
  tx: TxClient,
  phone: string,
  exceptNoteId?: string,
): Promise<void> {
  const telefono = normalizePhone(phone);

  // El cerrojo va antes de leer, o dos altas simultáneas pasarían las dos.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ISSUE_LOCK}::int, hashtext(${telefono})::int)`;

  const pendiente = await tx.promissoryNote.findFirst({
    where: {
      debtor: { phone: { in: [telefono, `+${telefono.replace(/^\+/, '')}`] } },
      status: { in: ['PENDING_SIGNATURE', 'PROCESSING_SIGNATURE'] },
      ...(exceptNoteId ? { id: { not: exceptNoteId } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { folio: true },
  });

  if (pendiente) throw new DebtorHasUnsignedNoteError(pendiente.folio);
}
