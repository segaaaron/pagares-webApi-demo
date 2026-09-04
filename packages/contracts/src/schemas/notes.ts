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
    /**
     * En cuántos pagos se documenta la deuda (§12).
     *
     * Un pagaré es de pago único, así que doce mensualidades son **doce
     * pagarés** firmados el mismo día, numerados «3 de 12» y con vencimientos
     * mes a mes desde `dueDate`. Uno es el caso normal y no crea serie.
     *
     * `amountCents` sigue siendo el total de la deuda: el servidor lo reparte,
     * porque dejar que el cliente mande las cuotas invita a que no sumen.
     */
    installments: z.number().int().min(1).max(24).default(1),
    /**
     * Cómo se cobra el **interés ordinario** del plan, que es lo que gana quien
     * presta por prestar (§12). No es el moratorio: aquél sanciona el atraso y
     * se pacta en `interestRate`.
     *
     * · `NONE` — sin precio por prestar: las cuotas sólo reparten el capital.
     * · `INSOLUTOS` — se calcula cada mes sobre lo que aún se debe.
     * · `GLOBAL` — siempre sobre el importe original, aunque ya se haya pagado
     *   la mitad. Con la misma tasa sale bastante más caro, y el sistema lo
     *   enseña antes de emitir en vez de esconderlo.
     */
    plan: z
      .object({
        model: z.enum(['NONE', 'INSOLUTOS', 'GLOBAL']).default('NONE'),
        rate: z
          .object({
            value: z.number().min(0).max(100),
            period: z.enum(['MONTHLY', 'ANNUAL']),
          })
          .strict()
          .nullable()
          .default(null),
      })
      .strict()
      .default({ model: 'NONE', rate: null }),
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
  })
  .refine((v) => v.plan.model === 'NONE' || (v.plan.rate?.value ?? 0) > 0, {
    // Un plan con interés y sin tasa es un plan sin interés con más pasos.
    path: ['plan', 'rate'],
    message: 'Un plan con interés necesita su tasa',
  })
  .refine((v) => v.plan.model === 'NONE' || v.installments > 1, {
    // El interés del plan se reparte entre cuotas: sin plazos no hay plan.
    path: ['plan', 'model'],
    message: 'El interés del plan sólo aplica a pagos en varias cuotas',
  })
  .refine(
    (v) => {
      /*
       * Defensivo a propósito: esta comprobación corre aunque `amountCents` o
       * `installments` ya hayan fallado su propia validación, y entonces
       * convertirlos reventaría con un error que no dice nada. Si alguno no es
       * utilizable, se deja pasar y habla el error de ese campo.
       */
      if (!/^\d+$/.test(v.amountCents) || !Number.isInteger(v.installments)) return true;
      if (v.installments < 1) return true;
      // Repartir mil pesos en veinticuatro pagos deja cuotas de céntimos; en
      // cuanto alguna no llega a un centavo, el reparto no existe.
      return BigInt(v.amountCents) / BigInt(v.installments) > 0n;
    },
    {
      path: ['installments'],
      message: 'El importe no alcanza para repartirse en tantos pagos',
    },
  );

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
