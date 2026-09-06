import { Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { AccountLockedError, RefreshReusedError } from '../domain/auth.errors.js';
import { TokenService, ACCESS_TTL_SECONDS } from '../infrastructure/token.service.js';

/**
 * Cuánto dura la tanda de peticiones de una misma carga de pantalla.
 *
 * Diez segundos: de sobra para que el navegador termine de pedir la página y
 * sus datos, y muy poco para un replay, que llega minutos u horas después.
 */
const RACE_WINDOW_MS = 10_000;

export interface RefreshInput {
  refreshToken: string;
}

export interface RefreshOutput {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  role: 'ADMIN' | 'CLIENT';
}

/**
 * Rotación del refresh con detección de reutilización (§10.4).
 *
 * Cada refresco invalida el anterior. Si llega uno **ya consumido**, la única
 * explicación razonable es que alguien copió el token: se revoca la familia
 * entera y se cierra sesión en todos los dispositivos. Es preferible molestar al
 * usuario legítimo que dejar viva la sesión de quien lo robó.
 */
@Injectable()
export class RefreshSessionUseCase extends BaseUseCase<RefreshInput, RefreshOutput> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(RefreshSessionUseCase.name));
  }

  protected async handle(input: RefreshInput, ctx: ExecutionContext): Promise<RefreshOutput> {
    const now = this.clock.now();
    const tokenHash = this.tokens.hashRefreshToken(input.refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) throw new RefreshReusedError();

    /*
     * Una carrera no es un robo (§10.4).
     *
     * El refresco vive en el middleware del panel y corre delante de **cada**
     * petición. El navegador pide la página, su carga de datos y las precargas a
     * la vez, así que varias llegan aquí con el mismo token todavía sin rotar:
     * la primera lo canjea y las demás presentan uno ya canjeado. Tratarlas como
     * reutilización mataba la familia entera y echaba al usuario a mitad de
     * trabajo, que es lo que estaba pasando en producción.
     *
     * Se distingue por el reloj: si el sucesor acaba de nacer y sigue vivo, es
     * la misma tanda de peticiones y se le da continuidad rotando desde él. Un
     * replay de verdad llega tarde —el atacante roba el token, no compite con el
     * navegador en el mismo segundo— y se sigue cortando igual.
     */
    const carrera =
      stored.revokedAt === null && stored.replacedById !== null
        ? await this.prisma.refreshToken.findFirst({
            where: {
              id: stored.replacedById,
              revokedAt: null,
              createdAt: { gt: new Date(now.getTime() - RACE_WINDOW_MS) },
              // Un solo salto. Si el sucesor ya rotó a su vez, esto no es una
              // tanda de peticiones simultáneas: es alguien volviendo con un
              // token viejo, y eso sí es reutilización.
              replacedById: null,
            },
            include: { user: true },
          })
        : null;

    const vigente = carrera ?? stored;

    // Reutilización: el token ya se había canjeado o revocado.
    if (carrera === null && (stored.revokedAt !== null || stored.replacedById !== null)) {
      // Revocar la familia, anotarlo y avisar al usuario son un solo hecho: si
      // se parten, puede quedar la familia muerta y nadie enterado (§3.3, §16).
      await this.prisma.$transaction(async (tx) => {
        await tx.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        await this.audit.record(
          {
            actorId: stored.userId,
            actorRole: 'SYSTEM',
            action: 'auth.refresh_reused',
            targetType: 'User',
            targetId: stored.userId,
            metadata: { familyId: stored.familyId },
            ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
          },
          tx,
        );
        await tx.outboxMessage.create({
          data: {
            eventType: 'RefreshReused',
            payload: { userId: stored.userId, ip: ctx.ip ?? null },
          },
        });
      });
      throw new RefreshReusedError();
    }

    if (vigente.expiresAt < now) throw new RefreshReusedError();
    if (vigente.user.status !== 'ACTIVE') throw new RefreshReusedError();
    if (vigente.user.lockedUntil && vigente.user.lockedUntil > now) {
      throw new AccountLockedError(
        Math.ceil((vigente.user.lockedUntil.getTime() - now.getTime()) / 1000),
      );
    }

    const next = this.tokens.generateRefreshToken();
    const created = await this.prisma.refreshToken.create({
      data: {
        userId: vigente.userId,
        familyId: vigente.familyId, // misma familia: así se detecta la reutilización
        deviceId: vigente.deviceId,
        // El dispositivo viaja con la sesión: sin arrastrarlo, la primera
        // rotación —cada quince minutos— lo perdería y el panel volvería a no
        // saber desde dónde entra nadie.
        platform: vigente.platform,
        deviceModel: vigente.deviceModel,
        osVersion: vigente.osVersion,
        appVersion: vigente.appVersion,
        tokenHash: next.hash,
        expiresAt: this.tokens.refreshExpiry(now),
      },
    });
    await this.prisma.refreshToken.update({
      where: { id: vigente.id },
      data: { replacedById: created.id },
    });

    return {
      accessToken: await this.tokens.issueAccess({
        sub: vigente.userId,
        role: vigente.user.role,
        pwdVersion: vigente.user.pwdVersion,
        // La sesión es la familia: rotar el refresh no la convierte en otra.
        sessionId: vigente.familyId,
      }),
      refreshToken: next.token,
      expiresIn: ACCESS_TTL_SECONDS,
      role: vigente.user.role,
    };
  }
}
