import { Injectable } from '@nestjs/common';
import { BaseUseCase } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { MAX_ATTEMPTS, outboxState, recipientOf, type OutboxState } from '../domain/outbox-state.js';

export interface NotificationRow {
  id: string;
  eventType: string;
  state: OutboxState;
  attempts: number;
  createdAt: string;
  publishedAt: string | null;
  /** Nulo cuando el evento resuelve el destinatario al enviarlo. */
  recipient: string | null;
  lastError: string | null;
}

export interface NotificationsView {
  /** Lo que nadie va a reintentar solo. Es la cifra que hay que mirar. */
  stuck: NotificationRow[];
  /** Aún tiene intentos: saldrá con la siguiente operación. */
  pending: NotificationRow[];
  counts: { stuck: number; pending: number };
}

/** Un fallo repetido cuenta lo mismo que uno nuevo; con veinte se ve el patrón. */
const LIMIT = 50;

/**
 * Avisos que no han salido (§18.1).
 *
 * El envío ocurre al cerrar cada operación, así que un correo caído no
 * interrumpe nada y por eso mismo puede pasar desapercibido durante horas. Esta
 * vista existe para que no pase: separa lo que aún se reintentará solo de lo que
 * ya agotó sus intentos y se quedaría muerto en la tabla para siempre.
 */
@Injectable()
export class ListNotificationsUseCase extends BaseUseCase<Record<string, never>, NotificationsView> {
  constructor(private readonly prisma: PrismaService) {
    super(new NestUseCaseLogger(ListNotificationsUseCase.name));
  }

  protected async handle(): Promise<NotificationsView> {
    const rows = await this.prisma.outboxMessage.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
    });

    const stuck: NotificationRow[] = [];
    const pending: NotificationRow[] = [];

    for (const row of rows) {
      const view: NotificationRow = {
        id: row.id,
        eventType: row.eventType,
        state: outboxState(row),
        attempts: row.attempts,
        createdAt: row.createdAt.toISOString(),
        publishedAt: row.publishedAt?.toISOString() ?? null,
        recipient: recipientOf(row.payload),
        lastError: row.lastError,
      };
      if (view.state === 'stuck') stuck.push(view);
      else pending.push(view);
    }

    return { stuck, pending, counts: { stuck: stuck.length, pending: pending.length } };
  }

  /** El contador de la bandeja: una consulta barata, sin traerse las filas. */
  async countStuck(): Promise<number> {
    return this.prisma.outboxMessage.count({
      where: { publishedAt: null, attempts: { gte: MAX_ATTEMPTS } },
    });
  }
}
