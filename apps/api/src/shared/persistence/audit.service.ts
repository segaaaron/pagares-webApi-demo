import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import type { Prisma } from '@prisma/client';
import { chainHash, type AuditEntry } from '../domain/audit-chain.js';
import { PrismaService } from './prisma.service.js';

export type { AuditEntry };

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
    const client = tx ?? this.prisma;
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
