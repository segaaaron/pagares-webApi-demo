import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import type { LoginRequest } from '@pagares/contracts';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../credentials/domain/ports/password-hasher.js';
import {
  isLocked,
  LOCKOUT_HOURS,
  MAX_FAILED_LOGINS,
  nextLockout,
} from '../../credentials/domain/password-policy.js';
import { AccountLockedError, InvalidCredentialsError, TempPasswordExpiredError } from '../domain/auth.errors.js';
import { TokenService, CHANGE_TOKEN_TTL_SECONDS } from '../infrastructure/token.service.js';
import { SessionIssuer, type SessionSubject } from './session-issuer.service.js';

export type LoginResult =
  | {
      outcome: 'session';
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      role: 'ADMIN' | 'CLIENT';
      user: { fullName: string; email: string };
    }
  | { outcome: 'must_change_password'; changeToken: string; expiresIn: number };

/**
 * Inicio de sesión (§10.3).
 *
 * Tres cosas que parecen detalles y no lo son:
 *  · El bloqueo se cuenta por cuenta, no por IP (decisión de §10.2).
 *  · Con correo inexistente igual se ejecuta un argon2 señuelo, para que el
 *    tiempo de respuesta no revele qué cuentas existen.
 *  · Si la contraseña es temporal, NO se emite sesión: se devuelve un token de
 *    un solo permiso para cambiarla.
 */
@Injectable()
export class LoginUseCase extends BaseUseCase<LoginRequest & { ip?: string }, LoginResult> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: SessionIssuer,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(LoginUseCase.name));
  }

  protected async handle(input: LoginRequest & { ip?: string }, ctx: ExecutionContext): Promise<LoginResult> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      await this.passwords.wasteTime();
      throw new InvalidCredentialsError();
    }

    if (isLocked(user.lockedUntil, now)) {
      const retryAfter = Math.ceil(((user.lockedUntil?.getTime() ?? 0) - now.getTime()) / 1000);
      throw new AccountLockedError(retryAfter);
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.registerFailure(user.id, user.failedLoginCount + 1, now, ctx);
      throw new InvalidCredentialsError();
    }

    if (user.mustChangePassword) {
      if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < now) {
        throw new TempPasswordExpiredError();
      }
      await this.resetFailures(user.id, now);
      return {
        outcome: 'must_change_password',
        changeToken: await this.tokens.issueChangeToken(user.id),
        expiresIn: CHANGE_TOKEN_TTL_SECONDS,
      };
    }

    await this.resetFailures(user.id, now);
    return this.issueSession(user, input);
  }

  private async registerFailure(
    userId: string,
    failedCount: number,
    now: Date,
    ctx: ExecutionContext,
  ): Promise<void> {
    const lockedUntil = nextLockout(failedCount, now);
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: failedCount, lockedUntil },
    });

    if (lockedUntil) {
      /*
       * El usuario debe enterarse: es también la señal de que alguien intenta
       * entrar, y la compensación de bloquear por cuenta y no por IP (§10.2).
       * La bitácora y el aviso se escriben en la misma transacción (§3.3): si el
       * proceso muere entre las dos, el correo no se pierde.
       */
      await this.prisma.$transaction(async (tx) => {
        await this.audit.record(
          {
            actorId: userId,
            actorRole: 'SYSTEM',
            action: 'auth.locked',
            targetType: 'User',
            targetId: userId,
            metadata: { failedCount: MAX_FAILED_LOGINS, hours: LOCKOUT_HOURS },
            ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
          },
          tx,
        );
        await tx.outboxMessage.create({
          data: {
            eventType: 'AccountLocked',
            payload: {
              userId,
              ip: ctx.ip ?? null,
              lockoutHours: LOCKOUT_HOURS,
            },
          },
        });
      });
    }
  }

  private async resetFailures(userId: string, now: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
  }

  private async issueSession(user: SessionSubject, input: LoginRequest): Promise<LoginResult> {
    const session = await this.sessions.issue(user, input.device);
    return { outcome: 'session', ...session };
  }
}
