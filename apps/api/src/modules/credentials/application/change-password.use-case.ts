import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { OTP_ISSUER, type OtpIssuer } from '../../otp/domain/ports/otp-issuer.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/ports/password-hasher.js';
import {
  assertChangeQuota,
  assertPasswordStrength,
  PASSWORD_HISTORY_SIZE,
  PasswordReusedError,
} from '../domain/password-policy.js';

export type ChangeMode = 'request' | 'confirm' | 'initial' | 'forgot' | 'reset';

export interface ChangePasswordInput {
  userId: string;
  mode: ChangeMode;
  code?: string | undefined;
  currentPassword?: string | undefined;
  newPassword?: string | undefined;
  /** Familia de refresh que sobrevive a la revocación: la sesión actual (§10.4). */
  keepCurrentSession?: string | undefined;
}

/**
 * Cambio y recuperación de contraseña (§10.3, flujos 3 y 4).
 *
 * El cambio autenticado exige OTP **y** la contraseña actual: el código prueba
 * acceso al correo, la contraseña prueba que quien está frente al teclado es el
 * dueño. Con sólo una de las dos, un teléfono desbloqueado bastaría.
 */
@Injectable()
export class ChangePasswordUseCase extends BaseUseCase<ChangePasswordInput, { ok: true }> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OTP_ISSUER) private readonly otp: OtpIssuer,
    private readonly audit: AuditService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ChangePasswordUseCase.name));
  }

  protected async handle(input: ChangePasswordInput, ctx: ExecutionContext): Promise<{ ok: true }> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: input.userId } });

    // Pedir el código: la cuota se comprueba **antes** de enviar nada.
    if (input.mode === 'request' || input.mode === 'forgot') {
      if (input.mode === 'request') await this.assertQuota(user.id, now);
      const purpose = input.mode === 'request' ? 'PASSWORD_CHANGE' : 'PASSWORD_RESET';

      return this.uow.run(async (scope) => {
        const code = await this.otp.issue(user.id, purpose, scope.client);

        // El código viaja por correo, nunca en la respuesta HTTP: devolverlo
        // permitiría saltarse el canal y cambiar la contraseña de otro con sólo
        // llamar al endpoint.
        scope.publish({
          eventId: randomUUID(),
          eventType: 'OtpIssued',
          occurredAt: now,
          payload: {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            code,
            purpose: input.mode === 'request' ? 'change' : 'reset',
            ip: ctx.ip ?? null,
          },
        });

        return { ok: true as const };
      });
    }

    const newPassword = input.newPassword ?? '';
    assertPasswordStrength(newPassword);

    if (input.mode === 'confirm') {
      await this.assertQuota(user.id, now);
      const valid = await this.passwords.verify(user.passwordHash, input.currentPassword ?? '');
      if (!valid) throw new UnauthorizedException('La contraseña actual no es correcta');
      await this.otp.consume(user.id, 'PASSWORD_CHANGE', input.code ?? '');
    }
    if (input.mode === 'reset') {
      await this.otp.consume(user.id, 'PASSWORD_RESET', input.code ?? '');
    }

    await this.assertNotReused(user.id, newPassword);
    const passwordHash = await this.passwords.hash(newPassword);

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // Incrementar la versión mata los access tokens vivos al instante (§10.4).
          pwdVersion: { increment: 1 },
          mustChangePassword: false,
          tempPasswordExpiresAt: null,
          passwordUpdatedAt: now,
          status: 'ACTIVE',
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      await tx.passwordHistory.create({ data: { userId: user.id, passwordHash: user.passwordHash } });
      await tx.passwordChangeLog.create({
        data: {
          userId: user.id,
          reason: input.mode === 'initial' ? 'INITIAL' : input.mode === 'reset' ? 'FORGOT' : 'SELF_CHANGE',
          ip: ctx.ip ?? null,
        },
      });

      // Revocación en cascada. El cambio autenticado conserva su propia sesión.
      await tx.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(input.keepCurrentSession ? { NOT: { familyId: input.keepCurrentSession } } : {}),
        },
        data: { revokedAt: now },
      });

      await this.audit.record(
        {
          actorId: user.id,
          actorRole: ctx.actorRole,
          action: `password.${input.mode}`,
          targetType: 'User',
          targetId: user.id,
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      scope.publish({
        eventId: randomUUID(),
        eventType: 'PasswordChanged',
        occurredAt: now,
        payload: { userId: user.id, email: user.email, fullName: user.fullName, mode: input.mode },
      });

      return { ok: true as const };
    });
  }

  private async assertQuota(userId: string, now: Date): Promise<void> {
    const changes = await this.prisma.passwordChangeLog.findMany({
      where: { userId, reason: { in: ['SELF_CHANGE', 'FORGOT'] } },
      select: { createdAt: true },
    });
    assertChangeQuota(
      changes.map((c) => c.createdAt),
      now,
    );
  }

  /** Impide repetir las últimas contraseñas (§10.2). */
  private async assertNotReused(userId: string, candidate: string): Promise<void> {
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_SIZE,
    });
    for (const entry of history) {
      if (await this.passwords.verify(entry.passwordHash, candidate)) throw new PasswordReusedError();
    }
  }
}
