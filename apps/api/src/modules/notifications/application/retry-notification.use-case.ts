import { Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, type ExecutionContext } from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { DispatchPendingService } from './dispatch-pending.service.js';
import { isRetryable, MAX_ATTEMPTS, outboxState } from '../domain/outbox-state.js';
import { AlreadyDeliveredError } from '../domain/notification.errors.js';

export interface RetryNotificationInput {
  /** Un aviso concreto, o todos los atascados si se omite. */
  id?: string | undefined;
}

export interface RetryResult {
  intentados: number;
  enviados: number;
  fallidos: number;
  /** El motivo del primer fallo: sin él, «no salió» no dice qué arreglar. */
  primerError: string | null;
}

/**
 * Reintento de avisos que no salieron (§18.1).
 *
 * El despacho normal abandona una fila al agotar sus intentos, y con razón: si
 * el proveedor rechaza el envío, reintentarlo en bucle no lo arregla y llena el
 * registro. Lo que faltaba era la otra mitad —una vez arreglada la causa, poder
 * decirle al sistema que lo vuelva a intentar— y sin ella la única salida era
 * tocar la base de datos a mano.
 *
 * Reintentar es poner el contador a cero y despachar en el acto. Si vuelve a
 * fallar, la fila queda otra vez atascada con su error nuevo, que es la
 * información que hacía falta.
 */
@Injectable()
export class RetryNotificationUseCase extends BaseUseCase<RetryNotificationInput, RetryResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: DispatchPendingService,
    private readonly audit: AuditService,
  ) {
    super(new NestUseCaseLogger(RetryNotificationUseCase.name));
  }

  protected async handle(
    input: RetryNotificationInput,
    ctx: ExecutionContext,
  ): Promise<RetryResult> {
    const objetivo = input.id
      ? await this.unaFila(input.id)
      : await this.prisma.outboxMessage.findMany({
          where: { publishedAt: null, attempts: { gte: MAX_ATTEMPTS } },
          orderBy: { createdAt: 'asc' },
        });

    if (objetivo.length === 0) {
      return { intentados: 0, enviados: 0, fallidos: 0, primerError: null };
    }

    const ids = objetivo.map((fila) => fila.id);

    /*
     * El contador y la bitácora se escriben antes de despachar, y en la misma
     * transacción: si el proceso muere en mitad del envío, queda constancia de
     * que alguien lo pidió y el aviso vuelve a estar en la cola de pendientes.
     */
    await this.prisma.$transaction(async (tx) => {
      await tx.outboxMessage.updateMany({
        where: { id: { in: ids } },
        data: { attempts: 0, lastError: null },
      });
      await this.audit.record(
        {
          // La ruta exige rol de administración, así que siempre hay actor.
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'notification.retried',
          targetType: 'OutboxMessage',
          targetId: input.id ?? 'todos',
          metadata: { ids, cuantos: ids.length },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );
    });

    await this.dispatcher.dispatchPending();

    // El resultado se lee de la base y no de lo que creemos que pasó: el
    // despacho pudo enviar unos y dejar otros con un error nuevo.
    const despues = await this.prisma.outboxMessage.findMany({
      where: { id: { in: ids } },
      select: { publishedAt: true, lastError: true },
    });

    const enviados = despues.filter((fila) => fila.publishedAt !== null).length;
    const primerError = despues.find((fila) => fila.lastError !== null)?.lastError ?? null;

    return {
      intentados: ids.length,
      enviados,
      fallidos: ids.length - enviados,
      primerError,
    };
  }

  private async unaFila(id: string): Promise<{ id: string; publishedAt: Date | null; attempts: number }[]> {
    const fila = await this.prisma.outboxMessage.findUnique({
      where: { id },
      select: { id: true, publishedAt: true, attempts: true },
    });
    if (!fila) throw new NotFoundException('El aviso no existe');

    // Reenviar algo entregado le manda el mismo correo dos veces al deudor.
    if (!isRetryable(fila)) throw new AlreadyDeliveredError(outboxState(fila));

    return [fila];
  }
}
