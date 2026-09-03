import { Injectable } from '@nestjs/common';
import type { Prisma, SequenceType } from '@prisma/client';

export interface FolioFormat {
  prefix: string;
  padding: number;
}

/**
 * Secuencias de folio (§25.3).
 *
 * El folio lo genera el servidor, nunca el cliente: es un identificador que se
 * dicta por teléfono y debe ser único, así que no puede depender de un móvil sin
 * red. Se asigna DENTRO de la transacción de creación y con bloqueo de fila, de
 * modo que dos altas simultáneas no producen el mismo número ni dejan huecos.
 */
@Injectable()
export class NumberingService {
  async next(
    tx: Prisma.TransactionClient,
    type: SequenceType,
    year: number,
    format: FolioFormat,
  ): Promise<string> {
    // upsert + update atómico: el incremento ocurre en la base, no en memoria.
    await tx.documentSequence.upsert({
      where: { type_year: { type, year } },
      create: { type, year, lastValue: 0 },
      update: {},
    });

    const sequence = await tx.documentSequence.update({
      where: { type_year: { type, year } },
      data: { lastValue: { increment: 1 } },
    });

    return `${format.prefix}-${year}-${String(sequence.lastValue).padStart(format.padding, '0')}`;
  }
}
