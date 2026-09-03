import { z } from 'zod';
import { centsSchema } from './common.js';

/**
 * Reglas del motor de recordatorios (§13.1). Viven en tabla, no en código, así
 * que su forma es contrato: el dashboard las edita y la API las aplica tal cual.
 */

export const reminderChannelSchema = z.enum(['EMAIL', 'PUSH', 'WHATSAPP', 'SMS']);

export const reminderConditionSchema = z
  .object({
    /** `balance > 0` es implícito; esto acota más. */
    minBalanceCents: centsSchema.optional(),
    debtorId: z.string().uuid().optional(),
  })
  .strict();

export const reminderRuleInputSchema = z
  .object({
    /** Negativo = antes del vencimiento. Un mes antes y un año después bastan. */
    offsetDays: z.number().int().min(-365).max(365),
    channel: reminderChannelSchema,
    /** Un identificador del catálogo de §16; la API rechaza los que no existen. */
    templateId: z.string().min(3).max(60),
    active: z.boolean(),
    condition: reminderConditionSchema.nullable().optional(),
  })
  .strict();

/**
 * El PUT manda **el juego completo**, no un parche: así la pantalla no puede
 * dejar reglas huérfanas de un borrado a medias, y repetir la llamada con el
 * mismo cuerpo deja exactamente el mismo estado.
 */
export const reminderRulesPutSchema = z
  .object({ rules: z.array(reminderRuleInputSchema).max(24) })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, rule] of value.rules.entries()) {
      const key = `${rule.offsetDays}:${rule.channel}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rules', index, 'offsetDays'],
          message: 'Ya hay una regla para ese día y ese canal',
        });
      }
      seen.add(key);
    }
  });

export type ReminderRuleInput = z.infer<typeof reminderRuleInputSchema>;
export type ReminderRulesPut = z.infer<typeof reminderRulesPutSchema>;
