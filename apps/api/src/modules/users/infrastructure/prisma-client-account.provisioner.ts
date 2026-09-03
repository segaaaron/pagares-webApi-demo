import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK, type Clock } from '@pagares/api-core';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../credentials/domain/ports/password-hasher.js';
import type { ClientAccountProvisioner } from '../../promissory-notes/domain/ports/client-account.js';

/** Horas que vive la contraseña temporal (§8.3). */
const TEMP_PASSWORD_HOURS = 72;

/**
 * Asegura la cuenta de acceso del deudor al emitir (§25.2).
 *
 * Si ya existe una cuenta con ese correo, se reutiliza: crear otra sería
 * partir en dos a la misma persona y además chocaría con el índice único del
 * correo. Si no existe, se crea con contraseña temporal y se publica
 * `UserCreated` en el mismo outbox que el pagaré, para que el correo con las
 * credenciales salga sólo si la transacción llega a confirmarse.
 */
@Injectable()
export class PrismaClientAccountProvisioner implements ClientAccountProvisioner {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async ensureForEmail(input: {
    tx: unknown;
    publish: (event: {
      eventId: string;
      eventType: string;
      occurredAt: Date;
      payload: Record<string, unknown>;
    }) => void;
    email: string;
    fullName: string;
    phone?: string | undefined;
    actorId: string | undefined;
  }): Promise<{ userId: string; created: boolean }> {
    const tx = input.tx as PrismaClient;
    const email = input.email.toLowerCase();

    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) return { userId: existing.id, created: false };

    const now = this.clock.now();
    const temporaryPassword = this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    const expiresAt = new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3_600_000);

    const user = await tx.user.create({
      data: {
        email,
        fullName: input.fullName,
        phone: input.phone ?? null,
        role: 'CLIENT',
        status: 'PENDING_ACTIVATION',
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: expiresAt,
        createdByAdminId: input.actorId ?? null,
      },
    });

    input.publish({
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

    return { userId: user.id, created: true };
  }
}
