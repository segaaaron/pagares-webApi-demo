import { z } from 'zod';
import { pageQuerySchema } from '../pagination.js';
import {
  agingBucketSchema,
  centsSchema,
  civilDateSchema,
  collectionStageSchema,
  currencySchema,
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
    /**
     * A quién se le emite. **Una ficha que ya existe**, y nada más.
     *
     * Emitir creaba la ficha al vuelo con los datos que viajaran aquí. Eran
     * otros campos que los del alta de deudores —sin notas, sin CURP—, así que
     * la misma persona se capturaba de dos formas distintas según por dónde
     * entrara. Se da de alta en `POST /admin/debtors` y aquí se elige.
     */
    debtor: z
      .object({ id: z.string().uuid() })
      .strict(),
    issuePlace: z.string().trim().min(2).max(120),
    issueDate: civilDateSchema,
    paymentPlace: z.string().trim().min(2).max(120),
    creditorName: z.string().trim().min(3).max(160),
    /**
     * Lo que se presta: el capital, sin el interés ordinario del plan.
     *
     * Lo que acaba diciendo el título es capital más ese interés, y lo calcula
     * el servidor (§4). Pedirle al administrador que teclee la suma sería
     * pedirle que haga a mano una cuenta que aquí ya está probada.
     */
    amountCents: centsSchema,
    currency: currencySchema.default('MXN'),
    /**
     * Tasa moratoria tal y como se firma. En México se pacta indistintamente
     * por quincena, por mes o por año —lo habitual en pagarés entre particulares
     * es mensual, y el anual es lo que manda la ley a falta de pacto: 6 % (art.
     * 362 C.Com. vía art. 174 LGTOC)—. El servidor la normaliza a anual para
     * calcular (§12.3), pero el documento dice lo que se firmó.
     */
    interestRate: z
      .object({
        value: z.number().min(0).max(100),
        period: z.enum(['MONTHLY', 'BIWEEKLY', 'ANNUAL']),
      })
      .strict()
      .nullable()
      .default(null),
    observations: z.string().trim().max(1000).optional(),
    /**
     * En cuántas cuotas se paga la deuda (ADR 0022).
     *
     * **Un** pagaré, siempre: doce mensualidades son un título por el total con
     * su tabla de amortización, no doce títulos. Los arts. 17 y 130 LGTOC
     * contemplan el pago en abonos sobre un mismo documento, y es lo que hacen
     * aquí las financieras: un contrato, un pagaré y su tabla.
     *
     * Junto con `paymentFrequency` y `issueDate` **decide cuándo vence el
     * título**: la primera cuota cae un periodo después de expedirlo y las
     * demás la siguen, así que el vencimiento es la última.
     *
     * Por eso no se pide una fecha de vencimiento: sería un cuarto dato que
     * puede contradecir a los otros tres. Se calcula, como todo lo derivado (§4).
     */
    installments: z.number().int().min(1).max(24).default(1),
    /**
     * Cada cuánto se paga (§12).
     *
     * Mensual o **quincenal**, que es cada quince días exactos. No es un detalle
     * de presentación: decide las fechas de las cuotas y el divisor de la tasa
     * anual —doce o veinticuatro—. Sin él, un plan quincenal cobraría el interés
     * de un mes entero cada quince días.
     */
    paymentFrequency: z.enum(['MONTHLY', 'BIWEEKLY']).default('MONTHLY'),
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
            period: z.enum(['MONTHLY', 'BIWEEKLY', 'ANNUAL']),
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
      // Repartir mil pesos en veinticuatro cuotas deja céntimos; en
      // cuanto alguna no llega a un centavo, el reparto no existe.
      return BigInt(v.amountCents) / BigInt(v.installments) > 0n;
    },
    {
      path: ['installments'],
      message: 'El importe no alcanza para repartirse en tantas cuotas',
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
