import {
  CanActivate,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLOCK, type Clock } from '@pagares/api-core';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../persistence/prisma.service.js';
import { TokenService, type ActorRole } from '../../modules/auth/infrastructure/token.service.js';

export const IS_PUBLIC = 'isPublic';
/** Excepción explícita al guard global. Denegar es el estado por defecto (§9.1). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: ActorRole[]) => SetMetadata(ROLES, roles);

export interface Actor {
  id: string;
  role: ActorRole;
  sessionId: string;
}

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest<Request & { actor?: Actor }>();
  if (!request.actor) throw new UnauthorizedException();
  return request.actor;
});

/**
 * Guard global. Además de verificar la firma del token consulta el estado del
 * usuario, porque un JWT válido no basta: si la contraseña cambió o la cuenta
 * quedó bloqueada, el token debe morir al instante (§10.4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { actor?: Actor; actorId?: string }>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException();

    const claims = await this.tokens.verifyAccess(token).catch(() => null);
    if (!claims) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { pwdVersion: true, status: true, lockedUntil: true, role: true },
    });
    if (!user) throw new UnauthorizedException();

    // La contraseña cambió: los tokens emitidos antes ya no valen.
    if (user.pwdVersion !== claims.pwdVersion) throw new UnauthorizedException();
    if (user.status !== 'ACTIVE') throw new UnauthorizedException();
    if (user.lockedUntil && user.lockedUntil > this.clock.now()) throw new UnauthorizedException();

    request.actor = { id: claims.sub, role: user.role, sessionId: claims.sessionId };
    request.actorId = claims.sub;

    const required = this.reflector.getAllAndOverride<ActorRole[]>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !required.includes(user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
