import { z } from 'zod';
import { centsSchema, civilDateSchema, reasonSchema } from './common.js';

export const paymentMethodSchema = z.enum(['CASH', 'TRANSFER', 'CHECK', 'OTHER']);

/**
 * Registro de un abono (§12.2). Exige `Idempotency-Key` en la cabecera:
 * un reintento por red cortada no puede duplicar un pago.
 */
export const registerPaymentRequestSchema = z
  .object({
    amountCents: centsSchema,
    paidOn: civilDateSchema,
    method: paymentMethodSchema,
    reference: z.string().trim().max(120).optional(),
    memo: z.string().trim().max(500).optional(),
  })
  .strict();

export type RegisterPaymentRequest = z.infer<typeof registerPaymentRequestSchema>;

/** Anular un abono es asentar una reversa, y una reversa exige motivo. */
export const voidPaymentRequestSchema = reasonSchema.strict();

export const paymentSchema = z
  .object({
    id: z.string().uuid(),
    amountCents: z.string(),
    /** Moratorio: la sanción por el atraso (§12.3). */
    appliedToInterestCents: z.string(),
    /** Interés ordinario: el precio del préstamo (§12, ADR 0020). */
    appliedToOrdinaryInterestCents: z.string(),
    appliedToPrincipalCents: z.string(),
    paidOn: civilDateSchema,
    method: paymentMethodSchema,
    reference: z.string().nullable(),
    isRecovery: z.boolean(),
    isReversal: z.boolean(),
    reversedByPaymentId: z.string().uuid().nullable(),
    registeredBy: z.string(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type Payment = z.infer<typeof paymentSchema>;
