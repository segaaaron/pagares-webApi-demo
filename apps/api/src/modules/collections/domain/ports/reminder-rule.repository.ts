import type { ReminderRuleData } from '@pagares/domain-rules';

export interface ReminderRuleRecord extends ReminderRuleData {
  /** Cuántos avisos se han mandado con esta regla: dice si sirve o sobra. */
  sentCount: number;
  updatedAt: Date;
}

export interface ReminderRuleWrite {
  offsetDays: number;
  channel: 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS';
  templateId: string;
  active: boolean;
  condition: ReminderRuleData['condition'];
}

/**
 * Puerto de las reglas de recordatorio.
 *
 * Existe para que el caso de uso hable de reglas y no de columnas `Json`: la
 * diferencia entre "sin condición" y "condición nula" es un detalle del ORM y
 * §1 lo quiere fuera de `application/`.
 */
export interface ReminderRuleRepository {
  list(): Promise<ReminderRuleRecord[]>;
  /** Reemplaza el juego completo. Las reglas con historial se apagan, no se borran. */
  replaceAll(rules: ReminderRuleWrite[], tx: unknown): Promise<void>;
  byId(id: string): Promise<ReminderRuleRecord | null>;
}

export const REMINDER_RULES = Symbol('ReminderRuleRepository');
