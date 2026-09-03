import { Controller, Get, Inject, Query } from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import { chainHash } from '../../shared/domain/audit-chain.js';
import { Roles } from '../../shared/http/auth.guard.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';

export interface ChainVerification {
  entries: number;
  intact: boolean;
  /** Primer índice donde la cadena deja de cuadrar, si lo hay. */
  brokenAt: number | null;
  checkedAt: string;
}

@Controller({ path: 'admin/audit', version: '1' })
@Roles('ADMIN')
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Bitácora legible: quién hizo qué y cuándo (§9.3). Sólo lectura. */
  @Get()
  async list(@Query('targetId') targetId?: string, @Query('limit') limit?: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: targetId ? { targetId } : {},
      orderBy: { chainIndex: 'desc' },
      take: Math.min(Number(limit ?? 100), 500),
    });

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorId: r.actorId,
      actorRole: r.actorRole,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Verifica la cadena de integridad (§24.1).
   *
   * Recalcula cada eslabón desde el primero. Si alguien alteró o borró una fila
   * directamente en la base, el hash deja de cuadrar a partir de ahí y esta
   * comprobación lo señala. Sin ejecutarla, el encadenado sería decorativo.
   */
  @Get('verify')
  async verify(): Promise<ChainVerification> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { chainIndex: 'asc' } });

    let previous: string | null = null;
    let brokenAt: number | null = null;

    for (const row of rows) {
      const expected = chainHash(
        previous,
        {
          actorId: row.actorId,
          actorRole: row.actorRole,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
          ...(row.ip !== null ? { ip: row.ip } : {}),
          ...(row.userAgent !== null ? { userAgent: row.userAgent } : {}),
        },
        row.createdAt,
      );

      if (expected !== row.chainHash || row.prevHash !== previous) {
        brokenAt = row.chainIndex;
        break;
      }
      previous = row.chainHash;
    }

    return {
      entries: rows.length,
      intact: brokenAt === null,
      brokenAt,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
