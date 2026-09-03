import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK, type Clock } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { TokenService, ACCESS_TTL_SECONDS } from '../infrastructure/token.service.js';

export interface DeviceInfo {
  deviceId: string;
  pushToken?: string | undefined;
  platform?: 'ios' | 'web' | undefined;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  role: 'ADMIN' | 'CLIENT';
  user: { fullName: string; email: string };
}

export interface SessionSubject {
  id: string;
  role: 'ADMIN' | 'CLIENT';
  pwdVersion: number;
  fullName: string;
  email: string;
}

/**
 * Emisión del par de tokens (§10.4).
 *
 * Vive aparte porque hay dos caminos que abren sesión —el login y el cambio
 * obligatorio del primer acceso (§10.3, flujo 2)— y duplicar la creación de la
 * familia de refresh en ambos es la forma de que uno de los dos se quede sin el
 * registro del dispositivo o sin fecha de caducidad.
 */
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(user: SessionSubject, device?: DeviceInfo | undefined): Promise<IssuedSession> {
    const now = this.clock.now();
    /*
     * El `sessionId` del access token **es** el `familyId` de la familia de
     * refresh, no un uuid aparte. Así "esta sesión" es algo que sobrevive a la
     * rotación del refresh, y el cambio de contraseña puede perdonar la sesión
     * desde la que se hizo sin tener que reconocer el token en la cookie (§10.4).
     */
    const familyId = randomUUID();
    const { token, hash } = this.tokens.generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hash,
        deviceId: device?.deviceId ?? null,
        expiresAt: this.tokens.refreshExpiry(now),
      },
    });

    // El token de push llega con la sesión, para no abrir una segunda vía de
    // escritura al cliente (§24.3).
    if (device?.pushToken) {
      await this.prisma.deviceToken.upsert({
        where: { token: device.pushToken },
        create: { userId: user.id, token: device.pushToken, platform: device.platform ?? 'ios' },
        update: { userId: user.id, lastSeenAt: now },
      });
    }

    return {
      accessToken: await this.tokens.issueAccess({
        sub: user.id,
        role: user.role,
        pwdVersion: user.pwdVersion,
        sessionId: familyId,
      }),
      refreshToken: token,
      expiresIn: ACCESS_TTL_SECONDS,
      role: user.role,
      user: { fullName: user.fullName, email: user.email },
    };
  }
}
