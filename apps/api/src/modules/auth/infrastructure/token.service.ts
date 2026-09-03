import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.schema.js';

export type ActorRole = 'ADMIN' | 'CLIENT';

export interface AccessClaims {
  sub: string;
  role: ActorRole;
  /** Cambia con cada contraseña nueva: mata los tokens vivos al instante (§10.4). */
  pwdVersion: number;
  sessionId: string;
  jti: string;
}

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 30;
export const CHANGE_TOKEN_TTL_SECONDS = 10 * 60;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issueAccess(claims: Omit<AccessClaims, 'jti'>): Promise<string> {
    return this.jwt.signAsync(
      { ...claims, jti: randomUUID() },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: ACCESS_TTL_SECONDS },
    );
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAsync<AccessClaims>(token, { secret: this.env.JWT_ACCESS_SECRET });
  }

  /**
   * Token de un solo permiso para el cambio obligatorio del primer acceso.
   * No es una sesión: no sirve para ningún otro endpoint (§10.3).
   */
  async issueChangeToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, scope: 'password:change-initial' },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: CHANGE_TOKEN_TTL_SECONDS },
    );
  }

  async verifyChangeToken(token: string): Promise<{ sub: string }> {
    const payload = await this.jwt.verifyAsync<{ sub: string; scope: string }>(token, {
      secret: this.env.JWT_ACCESS_SECRET,
    });
    if (payload.scope !== 'password:change-initial') {
      throw new Error('scope inválido');
    }
    return { sub: payload.sub };
  }

  /** El refresh es un secreto opaco; en base sólo vive su hash. */
  generateRefreshToken(): { token: string; hash: string } {
    const token = `${randomUUID()}.${randomUUID()}`;
    return { token, hash: createHash('sha256').update(token).digest('hex') };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + REFRESH_TTL_DAYS * 86_400_000);
  }
}
