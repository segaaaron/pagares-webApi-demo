/**
 * Motor de recordatorios (§13.1).
 *
 * Las reglas viven en una tabla editable, no en código; lo que vive aquí es la
 * única decisión que no es configuración: **qué regla le toca a un pagaré hoy**.
 * Es puro a propósito, para que el dashboard pueda previsualizar exactamente lo
 * que enviará el servidor sin llamar a la API.
 */

/** Regla tal como se guarda, sin nada de Prisma. */
export interface ReminderRuleData {
  id: string;
  /** Negativo = antes del vencimiento. `0` = el mismo día. */
  offsetDays: number;
  channel: 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS';
  templateId: string;
  active: boolean;
  /** `balance > 0` es implícito; esto acota más (§13.1). */
  condition?: ReminderCondition | null | undefined;
}

export interface ReminderCondition {
  /** Sólo pagarés con al menos este saldo, en centavos. */
  minBalanceCents?: string | undefined;
  /** Sólo este deudor: sirve para un trato especial sin tocar el resto. */
  debtorId?: string | undefined;
}

export interface ReminderTarget {
  /** Días respecto al vencimiento: negativo antes, positivo en atraso. */
  offsetDays: number;
  balanceCents: bigint;
  debtorId: string;
  /** Un expediente judicial abierto congela los avisos automáticos (§13.1). */
  inLitigation: boolean;
}

/**
 * La regla que corresponde hoy: la de mayor `offsetDays` que ya se haya
 * alcanzado. Con reglas en −7, −1 y +7 y un pagaré con tres días de atraso,
 * toca la de −1, no la de +7: el tramo es el último cruzado, no el siguiente.
 *
 * Devuelve `null` cuando no hay ninguna aplicable, que es una respuesta legítima
 * —un pagaré recién emitido no tiene aviso que mandar— y no un error.
 */
export function ruleForToday(
  rules: readonly ReminderRuleData[],
  target: ReminderTarget,
): ReminderRuleData | null {
  if (target.balanceCents <= 0n) return null;
  if (target.inLitigation) return null;

  const eligible = rules
    .filter((rule) => rule.active)
    .filter((rule) => rule.offsetDays <= target.offsetDays)
    .filter((rule) => matchesCondition(rule.condition, target))
    .sort((a, b) => b.offsetDays - a.offsetDays);

  return eligible[0] ?? null;
}

export function matchesCondition(
  condition: ReminderCondition | null | undefined,
  target: ReminderTarget,
): boolean {
  if (!condition) return true;
  if (condition.debtorId && condition.debtorId !== target.debtorId) return false;
  if (condition.minBalanceCents && target.balanceCents < BigInt(condition.minBalanceCents)) {
    return false;
  }
  return true;
}
