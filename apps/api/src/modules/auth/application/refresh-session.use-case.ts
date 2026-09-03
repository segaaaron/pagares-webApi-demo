import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { AccountLockedError, RefreshReusedError } from '../domain/auth.errors.js';
import { TokenService, ACCESS_TTL_SECONDS } from '../infrastructure/token.service.js';

export interface RefreshInput {
  refreshToken: string;
}

export interface RefreshOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  role: 'ADMIN' | 'CLIENT';
}

/**
 * Rotación del refresh con detección de reutilización (§10.4).
 *
 * Cada refresco invalida el anterior. Si llega uno **ya consumido**, la única
 * explicación razonable es que alguien copió el token: se revoca la familia
 * entera y se cierra sesión en todos los dispositivos. Es preferible molestar al
 * usuario legítimo que dejar viva la sesión de quien lo robó.
 */
@Injectable()
export class RefreshSessionUseCase extends BaseUseCase<RefreshInput, RefreshOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RefreshSessionUseCase.name));
  }

  protected async handle(input: RefreshInput, ctx: ExecutionContext): Promise<RefreshOutput> {
    const now = this.clock.now();
    const tokenHash = this.tokens.hashRefreshToken(input.refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) throw new RefreshReusedError();

    // Reutilización: el token ya se había canjeado o revocado.
    if (stored.revokedAt !== null || stored.replacedById !== null) {
      // Revocar la familia, anotarlo y avisar al usuario son un solo hecho: si
      // se parten, puede quedar la familia muerta y nadie enterado (§3.3, §16).
      await this.prisma.$transaction(async (tx) => {
        await tx.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        await this.audit.record(
          {
            actorId: stored.userId,
            actorRole: 'SYSTEM',
            action: 'auth.refresh_reused',
            targetType: 'User',
            targetId: stored.userId,
            metadata: { familyId: stored.familyId },
            ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
          },
          tx,
        );
        await tx.outboxMessage.create({
          data: {
            eventType: 'RefreshReused',
            payload: { userId: stored.userId, ip: ctx.ip ?? null },
          },
        });
      });
      throw new RefreshReusedError();
    }

    if (stored.expiresAt < now) throw new RefreshReusedError();
    if (stored.user.status !== 'ACTIVE') throw new RefreshReusedError();
    if (stored.user.lockedUntil && stored.user.lockedUntil > now) {
      throw new AccountLockedError(
        Math.ceil((stored.user.lockedUntil.getTime() - now.getTime()) / 1000),
      );
    }

    const next = this.tokens.generateRefreshToken();
    const created = await this.prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        familyId: stored.familyId, // misma familia: así se detecta la reutilización
        deviceId: stored.deviceId,
        tokenHash: next.hash,
        expiresAt: this.tokens.refreshExpiry(now),
      },
    });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: created.id },
    });

    return {
      accessToken: await this.tokens.issueAccess({
        sub: stored.userId,
        role: stored.user.role,
        pwdVersion: stored.user.pwdVersion,
        // La sesión es la familia: rotar el refresh no la convierte en otra.
        sessionId: stored.familyId,
      }),
      refreshToken: next.token,
      expiresIn: ACCESS_TTL_SECONDS,
      role: stored.user.role,
    };
  }
}
