import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { randomUUID } from 'node:crypto';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../credentials/domain/ports/password-hasher.js';
import { TEMP_PASSWORD_HOURS } from '../../credentials/domain/password-policy.js';

export interface CreateUserInput {
  email: string;
  fullName: string;
  phone?: string | undefined;
  role?: 'ADMIN' | 'CLIENT' | undefined;
}

export interface CreateUserOutput {
  id: string;
  email: string;
  /** En claro y una sola vez: no se persiste ni se puede recuperar después. */
  temporaryPassword: string;
  expiresAt: Date;
}

/**
 * Alta de una cuenta (§10.3, flujo 1). Sólo el administrador crea usuarios:
 * no hay registro público en ninguna parte del sistema.
 *
 * La temporal se muestra una vez al admin y se envía por correo. Se acota con
 * caducidad de 72 h, un solo uso y cambio obligatorio antes de acceder a nada.
 */
@Injectable()
export class CreateUserUseCase extends BaseUseCase<CreateUserInput, CreateUserOutput> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(CreateUserUseCase.name));
  }

  protected async handle(input: CreateUserInput, ctx: ExecutionContext): Promise<CreateUserOutput> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Ya existe una cuenta con ese correo');

    const now = this.clock.now();
    const temporaryPassword = this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    const expiresAt = new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3_600_000);

    return this.uow.run(async (scope) => {
      const tx = scope.client;
      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          phone: input.phone ?? null,
          role: input.role ?? 'CLIENT',
          status: 'PENDING_ACTIVATION',
          passwordHash,
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt,
          createdByAdminId: ctx.actorId,
        },
      });

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'user.create',
          targetType: 'User',
          targetId: user.id,
          metadata: { role: user.role },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      // El correo lo manda quien escuche el evento, no este caso de uso (§3.3).
      scope.publish({
        eventId: randomUUID(),
        eventType: 'UserCreated',
        occurredAt: now,
        payload: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          temporaryPassword,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return { id: user.id, email: user.email, temporaryPassword, expiresAt };
    });
  }
}
