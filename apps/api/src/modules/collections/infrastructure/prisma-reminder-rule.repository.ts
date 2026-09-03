import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReminderRuleData } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import type {
  ReminderRuleRecord,
  ReminderRuleRepository,
  ReminderRuleWrite,
} from '../domain/ports/reminder-rule.repository.js';

interface Row {
  id: string;
  offsetDays: number;
  channel: 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS';
  templateId: string;
  active: boolean;
  condition: Prisma.JsonValue | null;
  updatedAt: Date;
  _count?: { logs: number };
}

@Injectable()
export class PrismaReminderRuleRepository implements ReminderRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ReminderRuleRecord[]> {
    const rows = await this.prisma.reminderRule.findMany({
      orderBy: { offsetDays: 'asc' },
      include: { _count: { select: { logs: true } } },
    });
    return rows.map(toRecord);
  }

  async byId(id: string): Promise<ReminderRuleRecord | null> {
    const row = await this.prisma.reminderRule.findUnique({
      where: { id },
      include: { _count: { select: { logs: true } } },
    });
    return row ? toRecord(row) : null;
  }

  /**
   * Reemplazo del juego completo dentro de la transacción del caso de uso.
   *
   * Una regla que ya mandó avisos **no se borra**: se apaga. El log apunta a
   * ella, y borrarla dejaría envíos sin la regla que los explica (§7).
   */
  async replaceAll(rules: ReminderRuleWrite[], tx: unknown): Promise<void> {
    const client = tx as TxClient;
    const existing = await client.reminderRule.findMany({
      include: { _count: { select: { logs: true } } },
    });
    const keep = new Set(rules.map((rule) => `${rule.offsetDays}:${rule.channel}`));

    for (const row of existing) {
      if (keep.has(`${row.offsetDays}:${row.channel}`)) continue;
      if (row._count.logs > 0) {
        await client.reminderRule.update({ where: { id: row.id }, data: { active: false } });
      } else {
        await client.reminderRule.delete({ where: { id: row.id } });
      }
    }

    for (const rule of rules) {
      // `Prisma.DbNull` es cómo se dice "sin condición" en una columna Json:
      // `null` a secas sería el literal JSON nulo, que no significa lo mismo.
      const condition: Prisma.InputJsonValue | Prisma.NullTypes.DbNull = rule.condition
        ? { ...rule.condition }
        : Prisma.DbNull;
      await client.reminderRule.upsert({
        where: { offsetDays_channel: { offsetDays: rule.offsetDays, channel: rule.channel } },
        create: {
          offsetDays: rule.offsetDays,
          channel: rule.channel,
          templateId: rule.templateId,
          active: rule.active,
          condition,
        },
        update: { templateId: rule.templateId, active: rule.active, condition },
      });
    }
  }
}

function toRecord(row: Row): ReminderRuleRecord {
  return {
    id: row.id,
    offsetDays: row.offsetDays,
    channel: row.channel,
    templateId: row.templateId,
    active: row.active,
    condition: (row.condition ?? null) as ReminderRuleData['condition'],
    sentCount: row._count?.logs ?? 0,
    updatedAt: row.updatedAt,
  };
}
