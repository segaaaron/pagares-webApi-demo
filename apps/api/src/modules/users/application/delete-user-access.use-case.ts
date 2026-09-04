import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BaseUseCase,
  UNIT_OF_WORK,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';

export interface DeleteUserAccessInput {
  userId: string;
}

export interface DeleteUserAccessResult {
  deletedUserId: string;
  /** Cuántos pagarés siguen vivos tras quitarle el acceso. */
  notesKept: number;
  debtorId: string | null;
}

/**
 * Quitar el acceso a la aplicación sin tocar la deuda (§25.2).
 *
 * `Debtor` y `User` son cosas distintas a propósito: la persona que debe existe
 * aunque nunca haya tenido cuenta —hay quien firma en papel y no usa la app—, y
 * el pagaré es un título de crédito que no depende de una credencial. Por eso
 * esto borra sólo la cuenta: sus sesiones, sus dispositivos y su correo, que
 * queda libre.
 *
 * El pagaré conserva a su deudor y su saldo; lo único que pierde es el enlace a
 * esa cuenta, y se vuelve a crear desde la ficha del deudor cuando haga falta.
 */
@Injectable()
export class DeleteUserAccessUseCase extends BaseUseCase<
  DeleteUserAccessInput,
  DeleteUserAccessResult
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    private readonly audit: AuditService,
  ) {
    super(new NestUseCaseLogger(DeleteUserAccessUseCase.name));
  }

  protected async handle(
    input: DeleteUserAccessInput,
    ctx: ExecutionContext,
  ): Promise<DeleteUserAccessResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        debtorProfile: { select: { id: true } },
        _count: { select: { ownedNotes: true } },
      },
    });
    if (!user) throw new NotFoundException('La cuenta no existe');

    /**
     * Un administrador no se borra desde aquí. Es la forma más rápida de
     * quedarse sin ninguno y sin manera de entrar a arreglarlo (§10).
     */
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Las cuentas de administrador no se eliminan desde aquí');
    }

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      // Los pagarés se quedan; sólo sueltan el enlace con la cuenta que se va.
      await tx.promissoryNote.updateMany({ where: { ownerId: user.id }, data: { ownerId: null } });
      await tx.debtor.updateMany({ where: { userId: user.id }, data: { userId: null } });

      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      await tx.deviceToken.deleteMany({ where: { userId: user.id } });
      await tx.passwordChangeLog.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'user.access_deleted',
          targetType: 'User',
          targetId: user.id,
          // Qué había detrás en el momento de borrarlo: dentro de seis meses,
          // «se le quitó el acceso» sin más no explica nada.
          metadata: {
            email: user.email,
            fullName: user.fullName,
            notesKept: user._count.ownedNotes,
            debtorId: user.debtorProfile?.id ?? null,
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      return {
        deletedUserId: user.id,
        notesKept: user._count.ownedNotes,
        debtorId: user.debtorProfile?.id ?? null,
      };
    });
  }
}
