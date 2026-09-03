import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DomainEvent, TransactionScope, UnitOfWork } from '@pagares/api-core';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

export type TxClient = Prisma.TransactionClient;
export type TxScope = TransactionScope<TxClient>;

/**
 * Unidad de trabajo con outbox (§3.3).
 *
 * El cambio y sus eventos se escriben en la MISMA transacción. Publicar después
 * del commit parece equivalente y no lo es: si el proceso muere en ese hueco, el
 * abono queda guardado y el recibo no se genera nunca, sin error en el log.
 */
@Injectable()
export class PrismaUnitOfWork implements UnitOfWork<TxClient> {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(work: (scope: TxScope) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const events: DomainEvent[] = [];
      const scope: TxScope = { client: tx, publish: (event) => events.push(event) };

      const result = await work(scope);

      if (events.length > 0) {
        await tx.outboxMessage.createMany({
          data: events.map((event) => ({
            id: event.eventId || randomUUID(),
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
          })),
        });
      }
      return result;
    });
  }
}
