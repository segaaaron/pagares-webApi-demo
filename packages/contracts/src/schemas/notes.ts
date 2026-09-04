import { z } from 'zod';
import { pageQuerySchema } from '../pagination.js';
import {
  agingBucketSchema,
  centsSchema,
  civilDateSchema,
  collectionStageSchema,
  currencySchema,
  emailSchema,
  noteStatusSchema,
  phoneSchema,
  portfolioClassSchema,
} from './common.js';

/**
 * Emisión de un pagaré (§15). Sólo el administrador emite.
 * Nótese lo que NO está: `folio`, `status`, `amountInWords` ni `publicToken`.
 * Los calcula el servidor; aceptarlos del cliente sería confiar en quien no manda.
 */
export const createNoteRequestSchema = z
  .object({
    debtor: z
      .object({
        id: z.string().uuid().optional(),
        fullName: z.string().trim().min(3).max(160),
        address: z.string().trim().min(3).max(240),
        phone: phoneSchema,
        // Sin correo no hay cuenta ni avisos automáticos: firmará presencialmente (§25.12).
        email: emailSchema.optional(),
      })
      .strict(),
    issuePlace: z.string().trim().min(2).max(120),
    issueDate: civilDateSchema,
    paymentPlace: z.string().trim().min(2).max(120),
    dueDate: civilDateSchema,
    creditorName: z.string().trim().min(3).max(160),
    amountCents: centsSchema,
    currency: currencySchema.default('MXN'),
    /**
     * Tasa moratoria tal y como se firma. En México se pacta indistintamente
     * por mes o por año, y lo habitual en pagarés entre particulares es
     * mensual. El servidor la normaliza a anual para calcular (§12.3).
     */
    interestRate: z
      .object({
        value: z.number().min(0).max(100),
        period: z.enum(['MONTHLY', 'ANNUAL']),
      })
      .strict()
      .nullable()
      .default(null),
    observations: z.string().trim().max(1000).optional(),
    requiresGuarantors: z.number().int().min(0).max(2).default(0),
    guarantors: z
      .array(
        z
          .object({
            position: z.number().int().min(1).max(2),
            fullName: z.string().trim().min(3).max(160),
            address: z.string().trim().min(3).max(240),
            phone: phoneSchema,
          })
          .strict(),
      )
      .max(2)
      .default([]),
  })
  .strict()
  .refine((v) => v.dueDate > v.issueDate, {
    // Un vencimiento anterior a la expedición haría el pagaré exigible desde su origen.
    path: ['dueDate'],
    message: 'La fecha de pago debe ser posterior a la de expedición',
  })
  .refine((v) => v.guarantors.length === v.requiresGuarantors, {
    path: ['guarantors'],
    message: 'El número de avales debe coincidir con los declarados',
  });

export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

export const moneySchema = z
  .object({
    cents: centsSchema,
    currency: currencySchema,
    formatted: z.string(),
  })
  .strict();

/** Resumen de un pagaré en listados. Sólo lo que la tabla necesita pintar. */
export const noteSummarySchema = z
  .object({
    id: z.string().uuid(),
    folio: z.string(),
    status: noteStatusSchema,
    portfolioClass: portfolioClassSchema,
    agingBucket: agingBucketSchema,
    collectionStage: collectionStageSchema,
    debtorName: z.string(),
    /**
     * Para marcar desde la lista de cobranza sin abrir el pagaré (§24.2). Es
     * nulo cuando el deudor se dio de alta sin teléfono.
     */
    debtorPhone: z.string().nullable(),
    amount: moneySchema,
    paid: moneySchema,
    balance: moneySchema,
    dueDate: civilDateSchema,
    daysOverdue: z.number().int(),
    hasSignature: z.boolean(),
    signatureThumbUrl: z.string().url().nullable(),
  })
  .strict();

export type NoteSummary = z.infer<typeof noteSummarySchema>;

export const noteFiltersSchema = z
  .object({
    tab: z
      .enum([
        'todos',
        'por-firmar',
        'vigentes',
        'por-vencer',
        'vencidos',
        'cartera-vencida',
        'en-convenio',
        'en-juicio',
        'pagados',
        'renovados',
        'castigados',
        'anulados',
      ])
      .default('todos'),
    q: z.string().trim().max(120).optional(),
    bucket: agingBucketSchema.optional(),
    from: civilDateSchema.optional(),
    to: civilDateSchema.optional(),
    /**
     * Por fecha de **vencimiento**, no de emisión: es lo que responde «qué me
     * vence esta semana», que es la pregunta con la que se abre el día.
     */
    dueFrom: civilDateSchema.optional(),
    dueTo: civilDateSchema.optional(),
  })
  .strict();

export type NoteFilters = z.infer<typeof noteFiltersSchema>;

/**
 * Consulta completa del listado: paginación y filtros llegan juntos en la URL,
 * así que se validan con un solo schema. Dos schemas `.strict()` sobre el mismo
 * objeto se rechazan mutuamente los campos del otro.
 */
export const listNotesQuerySchema = pageQuerySchema.merge(noteFiltersSchema).strict();

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
