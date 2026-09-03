import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { TokenService } from '../infrastructure/token.service.js';

export interface LogoutInput {
  refreshToken?: string | undefined;
}

/** Cierre de sesión: revoca la familia del refresh presentado (§15). */
@Injectable()
export class LogoutUseCase extends BaseUseCase<LogoutInput, { revoked: number }> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(LogoutUseCase.name));
  }

  protected async handle(input: LogoutInput, _ctx: ExecutionContext): Promise<{ revoked: number }> {
    if (!input.refreshToken) return { revoked: 0 };

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(input.refreshToken) },
      select: { familyId: true },
    });
    if (!stored) return { revoked: 0 };

    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    return { revoked: result.count };
  }
}
