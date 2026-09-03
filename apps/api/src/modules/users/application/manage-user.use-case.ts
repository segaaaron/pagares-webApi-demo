import { Inject, Injectable } from '@nestjs/common';
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
import { PASSWORD_HASHER, type PasswordHasher } from '../../credentials/domain/ports/password-hasher.js';
import { TEMP_PASSWORD_HOURS } from '../../credentials/domain/password-policy.js';

export type UserAction = 'reset-password' | 'unlock' | 'suspend' | 'activate';

export interface ManageUserInput {
  userId: string;
  action: UserAction;
}

export interface ManageUserOutput {
  userId: string;
  status: string;
  /** Sólo en el reset: se muestra una vez y no se puede recuperar (§8.3). */
  temporaryPassword?: string;
  expiresAt?: string;
}

/**
 * Acciones del administrador sobre una cuenta (§10.3, flujos 5 y 6).
 *
 * El reset revoca todas las sesiones e incrementa `pwdVersion`, de modo que los
 * access tokens vivos mueren al instante en vez de seguir sirviendo 15 minutos.
 * Y pone la cuota de cambios a cero: si el admin interviene es porque el usuario
 * está atascado, y dejarlo sin cuota lo devolvería al mismo problema.
 */
@Injectable()
export class ManageUserUseCase extends BaseUseCase<ManageUserInput, ManageUserOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ManageUserUseCase.name));
  }

  protected async handle(input: ManageUserInput, ctx: ExecutionContext): Promise<ManageUserOutput> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: input.userId } });

    if (input.action === 'reset-password') {
      const temporaryPassword = this.passwords.generateTemporary();
      const passwordHash = await this.passwords.hash(temporaryPassword);
      const expiresAt = new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3_600_000);

      return this.uow.run(async (scope) => {
        const tx = scope.client;

        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            tempPasswordExpiresAt: expiresAt,
            pwdVersion: { increment: 1 },
            failedLoginCount: 0,
            lockedUntil: null,
            status: 'PENDING_ACTIVATION',
          },
        });

        // Revocación en cascada: nadie sigue dentro con la contraseña vieja.
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });

        // La cuota se pone a cero, no se consume (§10.2).
        await tx.passwordChangeLog.deleteMany({ where: { userId: user.id } });
        await tx.passwordChangeLog.create({
          data: { userId: user.id, reason: 'ADMIN_RESET', ip: ctx.ip ?? null },
        });

        await this.audit.record(
          {
            actorId: ctx.actorId ?? 'system',
            actorRole: ctx.actorRole,
            action: 'user.reset_password',
            targetType: 'User',
            targetId: user.id,
            ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
          },
          tx,
        );

        scope.publish({
          eventId: randomUUID(),
          eventType: 'PasswordReset',
          occurredAt: now,
          payload: {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            temporaryPassword,
            expiresAt: expiresAt.toISOString(),
            // Quién lo restableció va en el aviso: un correo con una contraseña
            // dentro y sin autor es indistinguible de una suplantación (§16, 5).
            resetById: ctx.actorId,
          },
        });

        return {
          userId: user.id,
          status: 'PENDING_ACTIVATION',
          temporaryPassword,
          expiresAt: expiresAt.toISOString(),
        };
      });
    }

    const data =
      input.action === 'unlock'
        ? { failedLoginCount: 0, lockedUntil: null }
        : input.action === 'suspend'
          ? { status: 'SUSPENDED' as const }
          : { status: 'ACTIVE' as const };

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const updated = await tx.user.update({ where: { id: user.id }, data });

      if (input.action === 'suspend') {
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: `user.${input.action}`,
          targetType: 'User',
          targetId: user.id,
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      return { userId: user.id, status: updated.status };
    });
  }
}
