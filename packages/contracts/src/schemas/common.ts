import { z } from 'zod';

/**
 * Piezas compartidas por todos los contratos.
 * `.strict()` en cada objeto de entrada: un campo extra es 422, y eso es lo que
 * impide el mass assignment de `role`, `status`, `ownerId` o `folio` (§9.1, API3).
 */

/** Los importes viajan como string: BigInt no sobrevive a JSON. */
export const centsSchema = z
  .string()
  .regex(/^\d{1,15}$/, 'El importe debe ser un entero de centavos');

export const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha esperado: AAAA-MM-DD');

/**
 * Teléfono, tal y como lo escribe una persona.
 *
 * Nadie teclea `+524431112233` de corrido: escribe `+52 443 111 2233`, o con
 * guiones, o entre paréntesis la lada. Rechazarlo con «Teléfono de 7 a 15
 * dígitos» era mandar a adivinar qué sobraba —los espacios— cuando el número
 * estaba bien.
 *
 * Se limpian los separadores y se valida lo que queda. El `+` se conserva
 * porque distingue un número internacional de uno local.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/[\s().-]/g, ''))
  .refine((valor) => /^\+?\d{7,15}$/.test(valor), {
    message: 'Escribe el número con lada, por ejemplo +52 443 111 2233',
  });

export const emailSchema = z.string().trim().toLowerCase().email();

export const currencySchema = z.literal('MXN'); // una moneda por instalación (§25.15)

export const noteStatusSchema = z.enum([
  'PENDING_SIGNATURE',
  'PROCESSING_SIGNATURE',
  'ISSUED',
  'PARTIALLY_PAID',
  'OVERDUE',
  'PAID',
  'RESTRUCTURED',
  'RENEWED',
  'WRITTEN_OFF',
  'VOID',
]);

export const portfolioClassSchema = z.enum(['VIGENTE', 'VENCIDA']);
export const agingBucketSchema = z.enum([
  'CURRENT',
  'D1_30',
  'D31_60',
  'D61_90',
  'D91_120',
  'D120_PLUS',
]);
export const collectionStageSchema = z.enum([
  'PREVENTIVA',
  'ADMINISTRATIVA',
  'EXTRAJUDICIAL',
  'JUDICIAL',
  'CASTIGO',
]);

export type NoteStatus = z.infer<typeof noteStatusSchema>;
export type PortfolioClass = z.infer<typeof portfolioClassSchema>;
export type AgingBucket = z.infer<typeof agingBucketSchema>;
export type CollectionStage = z.infer<typeof collectionStageSchema>;

/** Motivo obligatorio en las acciones con impacto económico (§11.3). */
export const reasonSchema = z.object({
  reasonCode: z.string().min(2).max(40),
  reasonNote: z.string().trim().min(3).max(500),
});

/**
 * Confirmación escrita para castigo y quita (§24.5).
 *
 * Además del motivo, hay que **teclear el folio**. Son las dos acciones con
 * impacto económico irreversible, y un diálogo con un botón de "sí" se acepta
 * por costumbre; escribir `PAG-2026-000128` no se hace sin querer. El servidor
 * lo comprueba: si sólo lo validara el front, bastaría con llamar a la API.
 */
export const writtenConfirmationSchema = z.object({
  confirmFolio: z.string().trim().min(3).max(40),
});
