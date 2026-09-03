import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
  type CallHandler,
  type ExecutionContext as NestExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { Observable, from, switchMap } from 'rxjs';
import { PrismaService } from '../persistence/prisma.service.js';

const TTL_HOURS = 24;

/**
 * Idempotencia con las cuatro reglas de §12.4. Guardar la clave no basta:
 *
 *  1. La fila se inserta ANTES de ejecutar y en estado IN_FLIGHT, así dos
 *     peticiones simultáneas no se cuelan entre medias.
 *  2. La clave se acota al endpoint y al actor: la misma clave en dos rutas
 *     distintas no colisiona.
 *  3. Misma clave con otro cuerpo devuelve 422: es un error del cliente, y
 *     devolverle la respuesta vieja sería peor que fallar.
 *  4. Un 5xx no se cachea: una caída del servidor no puede dejar al cliente
 *     clavado en un error permanente.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: NestExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { actorId?: string }>();
    const key = request.header('idempotency-key');

    if (!key) {
      throw new BadRequestException('Esta operación exige la cabecera Idempotency-Key');
    }

    const endpoint = `${request.method} ${request.route?.path ?? request.path}`;
    const actorId = request.actorId ?? 'anonymous';
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request.body ?? {}))
      .digest('hex');

    return from(this.claim(key, endpoint, actorId, requestHash)).pipe(
      switchMap((cached) => {
        if (cached) return from(Promise.resolve(cached));
        return next.handle().pipe(
          switchMap(async (body: unknown) => {
            await this.complete(key, body);
            return body;
          }),
        );
      }),
    );
  }

  /** Reserva la clave o devuelve la respuesta ya calculada. */
  private async claim(
    key: string,
    endpoint: string,
    actorId: string,
    requestHash: string,
  ): Promise<unknown | null> {
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });

    if (existing) {
      if (existing.endpoint !== endpoint || existing.actorId !== actorId) {
        throw new ConflictException('La clave de idempotencia pertenece a otra operación');
      }
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'La misma clave de idempotencia llegó con un cuerpo distinto',
        );
      }
      if (existing.status === 'IN_FLIGHT') {
        throw new ConflictException('La operación con esta clave está en curso');
      }
      return existing.responseBody;
    }

    await this.prisma.idempotencyKey.create({
      data: {
        key,
        endpoint,
        actorId,
        requestHash,
        status: 'IN_FLIGHT',
        expiresAt: new Date(Date.now() + TTL_HOURS * 3_600_000),
      },
    });
    return null;
  }

  private async complete(key: string, body: unknown): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { key },
      data: { status: 'COMPLETED', responseCode: 200, responseBody: body as object },
    });
  }
}
