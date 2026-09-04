import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import type { Prisma } from '@prisma/client';
import { chainHash, type AuditEntry } from '../domain/audit-chain.js';
import { PrismaService } from './prisma.service.js';

export type { AuditEntry };

/**
 * Llave del cerrojo que serializa el añadido a la bitácora.
 *
 * Es un número cualquiera pero fijo: `pg_advisory_xact_lock` sólo garantiza que
 * dos transacciones con la **misma** llave no corran a la vez.
 */
const AUDIT_LOCK = 776_1;

/**
 * Escritura de la bitácora. Vive en persistencia porque habla con la base;
 * la regla de encadenado es pura y vive en `shared/domain/audit-chain.ts`.
 * La bitácora es sólo de anexar: no existe endpoint que la edite ni la borre.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    // Sin transacción propia, el cerrojo no duraría lo que dura el añadido: se
    // suelta al confirmar, y sin `commit` no hay nada que soltar.
    if (!tx) return this.prisma.$transaction((propia) => this.append(entry, propia));
    return this.append(entry, tx);
  }

  /**
   * Añade un eslabón, y **de uno en uno**.
   *
   * El encadenado se calcula leyendo la punta de la cadena y escribiendo detrás.
   * Sin cerrojo, dos operaciones simultáneas —dos abonos, un abono y una
   * emisión— leen la misma punta y escriben dos eslabones que dicen venir del
   * mismo padre. La cadena queda rota sin que nadie la haya tocado, y la
   * comprobación de integridad grita «alterada» por un fallo propio: exactamente
   * lo que la vuelve inútil, porque a la tercera falsa alarma nadie la mira.
   *
   * El cerrojo es de transacción: se suelta al confirmar, no hace falta
   * liberarlo a mano, y sólo bloquea a quien escribe bitácora.
   */
  private async append(entry: AuditEntry, client: Prisma.TransactionClient): Promise<void> {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;

    const previous = await client.auditLog.findFirst({
      orderBy: { chainIndex: 'desc' },
      select: { chainHash: true },
    });

    const createdAt = this.clock.now();

    await client.auditLog.create({
      data: {
        prevHash: previous?.chainHash ?? null,
        chainHash: chainHash(previous?.chainHash ?? null, entry, createdAt),
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt,
      },
    });
  }
}
