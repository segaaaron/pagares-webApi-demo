import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE, OTP_THROTTLE } from '../../shared/http/throttler.config.js';
import {
  changeInitialPasswordRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  type LoginRequest,
} from '@pagares/contracts';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { LoginUseCase } from './application/login.use-case.js';
import { SessionIssuer, type DeviceInfo } from './application/session-issuer.service.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { ChangePasswordUseCase } from '../credentials/application/change-password.use-case.js';
import { DispatchPendingService } from '../notifications/application/dispatch-pending.service.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { TokenService } from './infrastructure/token.service.js';
import { CurrentActor, type Actor } from '../../shared/http/auth.guard.js';
import { Public } from '../../shared/http/auth.guard.js';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS } from './infrastructure/token.service.js';

const REFRESH_COOKIE = 'pagares_refresh';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly sessions: SessionIssuer,
    private readonly dispatcher: DispatchPendingService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Cambio obligatorio del primer acceso. **Sin OTP**: quien llega aquí ya
   * demostró posesión de la contraseña temporal (§10.3, flujo 2).
   */
  @Public()
  @Post('password/change-initial')
  @HttpCode(200)
  async changeInitial(
    @Body(new ZodValidationPipe(changeInitialPasswordRequestSchema))
    body: { changeToken: string; newPassword: string; device?: DeviceInfo },
    @Req() request: Request & { traceId?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const { sub } = await this.tokens.verifyChangeToken(body.changeToken).catch(() => {
      throw new UnauthorizedException('El enlace de cambio caducó');
    });

    await this.changePassword.execute(
      { userId: sub, mode: 'initial', newPassword: body.newPassword },
      this.systemContext(request),
    );
    await this.dispatcher.dispatchPending();

    // Deja la sesión abierta en el mismo paso: quien acaba de demostrar posesión
    // de la temporal y ha elegido una nueva no tiene nada más que probar (§10.3).
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: sub },
      select: { id: true, role: true, pwdVersion: true, fullName: true, email: true },
    });
    const session = await this.sessions.issue(user, body.device);
    this.setRefreshCookie(response, session.refreshToken);

    return {
      outcome: 'session' as const,
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      role: session.role,
      user: session.user,
    };
  }

  /** Pide el código para cambiar la contraseña estando dentro. */
  @Throttle(OTP_THROTTLE)
  @Post('password/change/request')
  @HttpCode(202)
  async requestChange(@CurrentActor() actor: Actor, @Req() request: Request & { traceId?: string }) {
    await this.changePassword.execute(
      { userId: actor.id, mode: 'request' },
      this.systemContext(request),
    );
    await this.dispatcher.dispatchPending();
    return { ok: true };
  }

  @Post('password/change/confirm')
  @HttpCode(200)
  async confirmChange(
    @Body(new ZodValidationPipe(changePasswordRequestSchema))
    body: { code: string; currentPassword: string; newPassword: string },
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    // El cambio revoca todas las sesiones salvo ésta (§10.4): el `sessionId` del
    // access token es la familia de refresh, así que basta con él.
    await this.changePassword.execute(
      { userId: actor.id, mode: 'confirm', ...body, keepCurrentSession: actor.sessionId },
      this.systemContext(request),
    );
    await this.dispatcher.dispatchPending();

    /*
     * El cambio incrementa `pwdVersion`, y eso mata al instante el access token
     * con el que se hizo la llamada (§10.4). Se devuelve uno nuevo de la misma
     * sesión: sin esto, la pantalla siguiente recibiría un 401 por haber hecho
     * exactamente lo que se le pidió.
     */
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { role: true, pwdVersion: true },
    });

    return {
      accessToken: await this.tokens.issueAccess({
        sub: actor.id,
        role: user.role,
        pwdVersion: user.pwdVersion,
        sessionId: actor.sessionId,
      }),
      expiresIn: ACCESS_TTL_SECONDS,
    };
  }

  /**
   * Olvido de contraseña. Responde **202 siempre**, exista o no la cuenta:
   * distinguirlo permitiría averiguar qué correos están registrados (§10.3).
   */
  @Public()
  @Throttle(OTP_THROTTLE)
  @Post('password/forgot')
  @HttpCode(202)
  async forgot(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: { email: string },
    @Req() request: Request & { traceId?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (user && user.status !== 'DISABLED') {
      await this.changePassword
        .execute({ userId: user.id, mode: 'forgot' }, this.systemContext(request))
        .catch(() => undefined); // un cooldown tampoco debe revelar que existe
      await this.dispatcher.dispatchPending();
    }
    return { ok: true };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('password/reset')
  @HttpCode(200)
  async reset(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema))
    body: { email: string; code: string; newPassword: string },
    @Req() request: Request & { traceId?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new UnauthorizedException('Código o correo incorrectos');

    await this.changePassword.execute(
      { userId: user.id, mode: 'reset', code: body.code, newPassword: body.newPassword },
      this.systemContext(request),
    );
    await this.dispatcher.dispatchPending();
    return { ok: true };
  }

  private systemContext(request: Request & { traceId?: string }) {
    return {
      traceId: request.traceId ?? 'unknown',
      actorId: null,
      actorRole: 'SYSTEM' as const,
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    };
  }

  /** Rotación del refresh. El token viaja en cookie httpOnly, no en el cuerpo. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async rotate(
    @Req() request: Request & { traceId?: string; cookies?: Record<string, string> },
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies?.[REFRESH_COOKIE] ?? '';
    // Igual que en el login: la reutilización de un refresh deja aviso y lanza.
    let result;
    try {
      result = await this.refresh.execute(
        { refreshToken: token },
        {
          traceId: request.traceId ?? 'unknown',
          actorId: null,
          actorRole: 'SYSTEM',
          ...(request.ip !== undefined ? { ip: request.ip } : {}),
        },
      );
    } finally {
      await this.dispatcher.dispatchPending();
    }
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn, role: result.role };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async signOut(
    @Req() request: Request & { traceId?: string; cookies?: Record<string, string> },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.logout.execute(
      { refreshToken: request.cookies?.[REFRESH_COOKIE] },
      { traceId: request.traceId ?? 'unknown', actorId: null, actorRole: 'SYSTEM' },
    );
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  private setRefreshCookie(response: Response, token: string): void {
    // Nunca legible por JavaScript (§9.2).
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: REFRESH_TTL_DAYS * 86_400_000,
    });
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async signIn(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request & { traceId?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    /*
     * `finally`: el intento fallido que bloquea la cuenta deja un aviso en el
     * outbox y luego lanza. Sin despachar aquí, la alerta de seguridad esperaría
     * a la siguiente operación del sistema —que puede ser mañana— y llegaría
     * cuando ya no sirve de nada (§18.1).
     */
    let result;
    try {
      result = await this.login.execute(body, {
        traceId: request.traceId ?? 'unknown',
        actorId: null,
        actorRole: 'SYSTEM',
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      });
    } finally {
      await this.dispatcher.dispatchPending();
    }

    if (result.outcome === 'session') {
      this.setRefreshCookie(response, result.refreshToken);
      return {
        outcome: result.outcome,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        role: result.role,
        // Nombre y correo para la interfaz. El refresh **no** sale del cuerpo:
        // viaja en cookie httpOnly y ahí se queda (§9.2).
        user: result.user,
      };
    }

    return result;
  }
}
