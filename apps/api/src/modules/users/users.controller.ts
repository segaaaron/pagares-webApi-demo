import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { emailSchema, phoneSchema } from '@pagares/contracts';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe.js';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor.js';
import { CurrentActor, Roles, type Actor } from '../../shared/http/auth.guard.js';
import { CreateUserUseCase } from './application/create-user.use-case.js';
import { DeleteUserAccessUseCase } from './application/delete-user-access.use-case.js';
import { ManageUserUseCase, type UserAction } from './application/manage-user.use-case.js';
import { PrismaService } from '../../shared/persistence/prisma.service.js';
import { DispatchPendingService } from '../notifications/application/dispatch-pending.service.js';

const createUserSchema = z
  .object({
    email: emailSchema,
    fullName: z.string().trim().min(3).max(160),
    phone: phoneSchema.optional(),
    role: z.enum(['ADMIN', 'CLIENT']).default('CLIENT'),
    /** Enlaza la cuenta con la ficha del deudor, no con su correo (§25.2). */
    debtorId: z.string().uuid().optional(),
  })
  .strict();

@Controller({ path: 'admin/users', version: '1' })
@Roles('ADMIN')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly dispatcher: DispatchPendingService,
    private readonly manageUser: ManageUserUseCase,
    private readonly deleteUserAccess: DeleteUserAccessUseCase,
    private readonly prisma: PrismaService,
  ) {}

  /** Listado de cuentas de acceso (§19.8). */
  @Get()
  async list(@Query('q') q?: string) {
    const users = await this.prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        lockedUntil: true,
        lastLoginAt: true,
        mustChangePassword: true,
        createdAt: true,
        _count: { select: { ownedNotes: true } },
        /**
         * Desde dónde entra cada quien (§24.3).
         *
         * El administrador trabaja en el panel y el deudor en la aplicación, y
         * la lista no lo distinguía: dos filas iguales para dos accesos que no
         * se parecen en nada. El dispositivo lo registra el propio inicio de
         * sesión, así que el dato ya estaba; sólo no se enseñaba.
         */
        deviceTokens: {
          select: { platform: true, lastSeenAt: true },
          orderBy: { lastSeenAt: 'desc' },
          take: 5,
        },
        /*
         * La última sesión abierta: de ahí sale desde dónde entra.
         *
         * El registro de tokens de push sólo tiene filas si hay APNs
         * configurado, así que mientras no lo hubo el panel decía «sin
         * estrenar» de un deudor que entraba todos los días. La sesión, en
         * cambio, existe siempre que alguien entra.
         */
        refreshTokens: {
          select: {
            platform: true,
            deviceModel: true,
            osVersion: true,
            appVersion: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      // El bloqueo no es un estado: es una fecha que se levanta sola (§10.1).
      lockedUntil: u.lockedUntil?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      mustChangePassword: u.mustChangePassword,
      notesCount: u._count.ownedNotes,
      devices: u.deviceTokens.map((d) => ({
        platform: d.platform,
        lastSeenAt: d.lastSeenAt.toISOString(),
      })),
      /** Desde dónde entró la última vez. Nulo si nunca ha entrado. */
      lastDevice: u.refreshTokens[0]
        ? {
            platform: u.refreshTokens[0].platform,
            model: u.refreshTokens[0].deviceModel,
            osVersion: u.refreshTokens[0].osVersion,
            appVersion: u.refreshTokens[0].appVersion,
            at: u.refreshTokens[0].createdAt.toISOString(),
          }
        : null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  /**
   * Quitar el acceso a la aplicación sin tocar la deuda (§25.2).
   *
   * Borra la cuenta y libera el correo; el deudor y sus pagarés se quedan. Es
   * `DELETE` sobre la cuenta, no sobre la persona: la persona no se borra
   * porque tampoco desaparece el dinero que debe.
   */
  @Delete(':id')
  async deleteAccess(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    return this.deleteUserAccess.execute(
      { userId: id },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );
  }

  @Post(':id/:action')
  async manage(
    @Param('id') id: string,
    @Param('action') action: string,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const allowed: UserAction[] = ['reset-password', 'unlock', 'suspend', 'activate'];
    if (!allowed.includes(action as UserAction)) {
      throw new BadRequestException(`Acción no permitida. Opciones: ${allowed.join(', ')}`);
    }

    const result = await this.manageUser.execute(
      { userId: id, action: action as UserAction },
      {
        traceId: request.traceId ?? 'unknown',
        actorId: actor.id,
        actorRole: actor.role,
        ...(request.ip !== undefined ? { ip: request.ip } : {}),
      },
    );

    // El aviso quedó en la transacción; ahora que confirmó se intenta enviar.
    await this.dispatcher.dispatchPending();
    return result;
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) body: z.infer<typeof createUserSchema>,
    @CurrentActor() actor: Actor,
    @Req() request: Request & { traceId?: string },
  ) {
    const result = await this.createUser.execute(body, {
      traceId: request.traceId ?? 'unknown',
      actorId: actor.id,
      actorRole: actor.role,
      ...(request.ip !== undefined ? { ip: request.ip } : {}),
    });

    // El aviso se guardó en la transacción; ahora que confirmó, se intenta enviar.
    await this.dispatcher.dispatchPending();

    return {
      id: result.id,
      email: result.email,
      // Se devuelve una vez. El dashboard la muestra con aviso de que no vuelve.
      temporaryPassword: result.temporaryPassword,
      temporaryPasswordExpiresAt: result.expiresAt.toISOString(),
    };
  }
}
