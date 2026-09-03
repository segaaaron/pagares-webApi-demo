import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import type { ReminderRuleInput } from '@pagares/contracts';
import { REMINDER_TEMPLATE_IDS, TEMPLATE_IDS } from '@pagares/emails';
import type { ReminderRuleData } from '@pagares/domain-rules';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import {
  REMINDER_RULES,
  type ReminderRuleRepository,
} from '../domain/ports/reminder-rule.repository.js';

export interface ReminderRuleView extends ReminderRuleData {
  sentCount: number;
  updatedAt: string;
}

@Injectable()
export class ListReminderRulesUseCase extends BaseUseCase<
  Record<string, never>,
  { rules: ReminderRuleView[]; templates: string[] }
> {
  constructor(@Inject(REMINDER_RULES) private readonly rules: ReminderRuleRepository) {
    super(new NestUseCaseLogger(ListReminderRulesUseCase.name));
  }

  protected async handle(): Promise<{ rules: ReminderRuleView[]; templates: string[] }> {
    const rows = await this.rules.list();
    return {
      rules: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      templates: [...REMINDER_TEMPLATE_IDS],
    };
  }
}

/**
 * Reemplaza el juego completo de reglas (§13.1).
 *
 * La pantalla manda el conjunto entero y se aplica en una transacción: parchear
 * regla a regla dejaría, en cuanto falle una de las llamadas, una cartera
 * avisada por la mitad. Y repetir la misma llamada deja el mismo estado.
 */
@Injectable()
export class ReplaceReminderRulesUseCase extends BaseUseCase<
  { rules: ReminderRuleInput[] },
  { rules: number }
> {
  constructor(
    @Inject(REMINDER_RULES) private readonly repository: ReminderRuleRepository,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ReplaceReminderRulesUseCase.name));
  }

  protected async handle(
    input: { rules: ReminderRuleInput[] },
    ctx: ExecutionContext,
  ): Promise<{ rules: number }> {
    for (const rule of input.rules) {
      if (!TEMPLATE_IDS.includes(rule.templateId as (typeof TEMPLATE_IDS)[number])) {
        throw new BadRequestException(`La plantilla ${rule.templateId} no existe en el catálogo`);
      }
      if (!REMINDER_TEMPLATE_IDS.includes(rule.templateId as (typeof REMINDER_TEMPLATE_IDS)[number])) {
        throw new BadRequestException(
          `La plantilla ${rule.templateId} no es un recordatorio: no puede colgarse de una regla`,
        );
      }
    }

    return this.uow.run(async (scope) => {
      await this.repository.replaceAll(
        input.rules.map((rule) => ({
          offsetDays: rule.offsetDays,
          channel: rule.channel,
          templateId: rule.templateId,
          active: rule.active,
          condition: rule.condition ?? null,
        })),
        scope.client,
      );

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'reminder_rules.replace',
          targetType: 'ReminderRule',
          targetId: 'all',
          metadata: { rules: input.rules.length, at: this.clock.now().toISOString() },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        scope.client,
      );

      return { rules: input.rules.length };
    });
  }
}
