import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { BaseUseCase, UNIT_OF_WORK, type ExecutionContext, type UnitOfWork } from '@pagares/api-core';
import { Inject } from '@nestjs/common';
import type { CreateDebtorRequest } from '@pagares/contracts';
import { isValidCurp, normalizeCurp } from '@pagares/domain-rules';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { normalizePhone } from '../../promissory-notes/application/assert-nothing-unsigned.js';

export interface CreateDebtorOutput {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
}

/**
 * Alta de un deudor (§19.8).
 *
 * Hasta ahora una ficha sólo nacía **dentro** de otra operación: al emitirle su
 * primer pagaré o al importar cartera. Funcionaba, pero obligaba a emitir para
 * poder dar de alta, y dejaba dos capturas distintas de la misma persona que ya
 * habían divergido. Ésta es la puerta que faltaba, con los mismos campos que el
 * importador.
 *
 * Aquí no se crea cuenta de acceso: el acceso se da después, desde la ficha, y
 * con los datos que esta ficha ya tiene (§25.2). Una cosa cada vez.
 */
@Injectable()
export class CreateDebtorUseCase extends BaseUseCase<CreateDebtorRequest, CreateDebtorOutput> {
  constructor(
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
  ) {
    super(new NestUseCaseLogger(CreateDebtorUseCase.name));
  }

  protected async handle(
    input: CreateDebtorRequest,
    ctx: ExecutionContext,
  ): Promise<CreateDebtorOutput> {
    /*
     * La CURP se comprueba entera —forma y dígito verificador— o no se guarda.
     * Una clave con un dedazo es peor que ninguna: parece que identifica a la
     * persona hasta el día que hay que cotejarla con una identificación.
     */
    const curp = input.curp ? normalizeCurp(input.curp) : null;
    if (curp && !isValidCurp(curp)) {
      throw new BadRequestException('La CURP no es válida: revisa que esté completa y bien escrita');
    }

    const phone = normalizePhone(input.phone);
    const email = input.email?.toLowerCase() ?? null;

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      /*
       * El teléfono es la identidad de un deudor en este sistema (ADR 0019), así
       * que dos fichas con el mismo número son casi siempre la misma persona
       * capturada dos veces. Se avisa con el nombre de la que ya existe, para
       * que quien da de alta decida: puede que de verdad compartan línea.
       */
      const repetido = await tx.debtor.findFirst({
        where: { phone },
        select: { id: true, fullName: true },
      });
      if (repetido) {
        throw new ConflictException(
          `Ese teléfono ya es de ${repetido.fullName}. Búscalo en la lista en vez de darlo de alta otra vez.`,
        );
      }

      const debtor = await tx.debtor.create({
        data: {
          fullName: input.fullName,
          address: input.address,
          phone,
          email,
          notes: input.notes ?? null,
          curp,
        },
        select: { id: true, fullName: true, phone: true, email: true },
      });

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'debtor.create',
          targetType: 'Debtor',
          targetId: debtor.id,
          metadata: { fullName: debtor.fullName, hasEmail: email !== null, hasCurp: curp !== null },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      return debtor;
    });
  }
}
