import { z } from 'zod';

/**
 * Importación inicial de cartera (§24.5).
 *
 * `commit: false` es el estado por defecto **a propósito**: la primera llamada
 * valida y enseña los conflictos, y sólo la segunda escribe. Una importación que
 * escribe al primer intento es la que mete 300 pagarés con la fecha mal.
 */
export const importRequestSchema = z
  .object({
    /** El contenido del archivo, no el archivo: son unos cientos de filas. */
    csv: z.string().min(1).max(2_000_000),
    commit: z.boolean().default(false),
  })
  .strict();

export const importIssueSchema = z
  .object({
    /** Número de fila del archivo, contando la cabecera como 1. */
    row: z.number().int(),
    field: z.string(),
    message: z.string(),
    severity: z.enum(['error', 'conflict']),
  })
  .strict();

export const importResultSchema = z
  .object({
    rows: z.number().int(),
    valid: z.number().int(),
    /** Filas que existen ya: se omiten, no se duplican ni se sobreescriben. */
    duplicates: z.number().int(),
    issues: z.array(importIssueSchema),
    /** `null` mientras no se confirme: la validación no escribe nada. */
    created: z.number().int().nullable(),
    committed: z.boolean(),
  })
  .strict();

export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportIssue = z.infer<typeof importIssueSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
