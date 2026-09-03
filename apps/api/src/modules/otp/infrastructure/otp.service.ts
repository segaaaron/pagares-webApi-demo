import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '@pagares/api-core';
import type { OtpPurpose, Prisma } from '@prisma/client';
import type { OtpIssuer, OtpPurposeName } from '../domain/ports/otp-issuer.js';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { PASSWORD_HASHER, type PasswordHasher } from '../../credentials/domain/ports/password-hasher.js';
import {
  checkOtpState,
  cooldownRemaining,
  OTP_MAX_PER_HOUR,
  OTP_TTL_MINUTES,
} from '../domain/otp-policy.js';
import {
  OtpAttemptsExceededError,
  OtpCooldownError,
  OtpExpiredError,
  OtpInvalidError,
} from '../domain/otp.errors.js';

/**
 * Emisión y verificación de códigos (§10.2).
 *
 * Vive en infraestructura porque persiste y consulta: la regla del código —cuándo
 * caduca, cuántos intentos admite— es pura y está en `domain/otp-policy.ts`.
 *
 * El código **nunca se guarda en claro**: en base vive su hash, y la comparación
 * es en tiempo constante. Emitir uno nuevo invalida los anteriores del mismo
 * propósito, para que no queden varios códigos válidos a la vez.
 */
@Injectable()
export class OtpService implements OtpIssuer {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(userId: string, purpose: OtpPurposeName, tx?: unknown): Promise<string> {
    const client = (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
    const now = this.clock.now();

    const recent = await client.otpChallenge.findMany({
      where: { userId, purpose: purpose as OtpPurpose, createdAt: { gte: new Date(now.getTime() - 3_600_000) } },
      orderBy: { createdAt: 'desc' },
    });

    const wait = cooldownRemaining(recent[0]?.createdAt ?? null, now);
    if (wait > 0) throw new OtpCooldownError(wait);
    if (recent.length >= OTP_MAX_PER_HOUR) throw new OtpCooldownError(3600);

    // Invalidar los previos: no pueden convivir dos códigos válidos.
    await client.otpChallenge.updateMany({
      where: { userId, purpose: purpose as OtpPurpose, consumedAt: null },
      data: { consumedAt: now },
    });

    const code = this.passwords.generateOtp();
    await client.otpChallenge.create({
      data: {
        userId,
        purpose: purpose as OtpPurpose,
        codeHash: this.passwords.hashOtp(code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
      },
    });

    return code;
  }

  /** Consume el código. Lanza si no es válido; nunca devuelve `false` en silencio. */
  async consume(userId: string, purpose: OtpPurposeName, code: string, tx?: unknown): Promise<void> {
    const client = (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
    const now = this.clock.now();

    const challenge = await client.otpChallenge.findFirst({
      where: { userId, purpose: purpose as OtpPurpose },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw new OtpExpiredError();

    // Caducidad e intentos se revisan antes que el valor: así el atacante no
    // distingue "incorrecto" de "caducado" gastando intentos.
    const state = checkOtpState(challenge, now);
    if (state === 'expired') throw new OtpExpiredError();
    if (state === 'attempts-exceeded') throw new OtpAttemptsExceededError();

    if (!this.passwords.verifyOtp(challenge.codeHash, code)) {
      await client.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new OtpInvalidError();
    }

    await client.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
  }
}
