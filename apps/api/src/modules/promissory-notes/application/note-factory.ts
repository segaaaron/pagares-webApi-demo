import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { addYears, amountToWords } from '@pagares/domain-rules';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { NumberingService } from '../../numbering/numbering.service.js';
import { assertNothingUnsigned } from './assert-nothing-unsigned.js';
import type { NoteStatus } from '../domain/note-status.js';
import type { AgingBucket, InterestPeriod, PortfolioClass } from '@pagares/domain-rules';

/*
 * La forma del `create` se toma del propio cliente de la transacción, no de
 * `@prisma/client`: la capa de aplicación no importa infraestructura (§3.2), y
 * lo comprueba `pnpm arch`.
 */
type CreateArg = Parameters<TxClient['promissoryNote']['create']>[0]['data'];
/** La variante por identificadores: aquí se escribe `debtorId`, no un `connect`. */
type NoteData = Extract<CreateArg, { debtorId: string }>;

/**
 * De dónde viene el pagaré. Decide dos cosas que no se pueden dejar al que
 * llama: si la regla de la firma pendiente aplica, y en qué estado nace.
 */
export type NoteOrigin =
  /** Emisión normal, con o sin calendario de cuotas. Nace por firmar. */
  | 'issue'
  /** Renovación: sustituye a otro título. Nace por firmar. */
  | 'renewal'
  /** Cartera vieja, firmada en papel: nace con el estado que le toque (§24.5). */
  | 'import';

/** Lo que el pagaré necesita saber y no se puede derivar. */
export interface NoteDraft {
  debtorId: string;
  ownerId: string | null;
  /** Identidad del deudor para la regla de la firma pendiente (ADR 0019). */
  debtorPhone: string;

  issuePlace: string;
  /** Fecha civil `YYYY-MM-DD`. */
  issueDate: string;
  paymentPlace: string;
  dueDate: string;
  creditorName: string;

  amountCents: bigint;
  currency?: string;
  /** Anual, ya convertida: es la que usa la aritmética (§12.3). */
  interestRateAnnualPct: Exclude<NoteData['interestRateAnnualPct'], undefined>;
  interestPeriod: 'MONTHLY' | 'BIWEEKLY' | 'ANNUAL';
  /** Cada cuánto se paga. Decidió las fechas y el divisor de la tasa (§12). */
  paymentFrequency?: 'MONTHLY' | 'BIWEEKLY';
  negotiable: boolean;
  observations?: string | null;
  /** Cuántos avales exige el título: 0, 1 o 2 (§25.15). */
  requiresGuarantors?: number;
  guarantors?: { position: number; fullName: string; address: string; phone: string }[];

  /** De qué está hecho el importe del título, tal como se pactó (§12). */
  plan?: {
    model: string;
    interestCents: bigint;
    principalCents: bigint;
    /** La tasa ordinaria pactada, anualizada, y su periodo. Nula sin plan. */
    rateAnnualPct: number | null;
    ratePeriod: InterestPeriod | null;
  };
  /**
   * El calendario de pagos, cuando la deuda se paga en cuotas (ADR 0022).
   *
   * Nace en la misma escritura que el pagaré: una tabla de amortización que
   * llegara después dejaría, aunque fuera un instante, un título que dice
   * pagarse a plazos sin decir cuáles.
   */
  schedule?: {
    index: number;
    /** Fecha civil `YYYY-MM-DD`. */
    dueOn: string;
    amountCents: bigint;
    interestCents: bigint;
    principalCents: bigint;
  }[];

  /** Sólo en la renovación: a qué título sustituye. */
  renewedFromId?: string;
  /** Sólo en la importación: lo ya abonado y el estado que de ahí se deriva. */
  imported?: {
    paidCents: bigint;
    status: NoteStatus;
    portfolioClass: PortfolioClass;
    agingBucket: AgingBucket;
    daysOverdue: number;
    acceptedAt: Date;
  };

  createdBy: string;
}

export interface NoteDefaults {
  folioPrefix: string;
  prescriptionYears: number;
}

export interface CreatedNote {
  id: string;
  folio: string;
  publicToken: string;
  status: NoteStatus;
  amountInWords: string;
}

/**
 * La única puerta por la que nace un pagaré (§11, §12).
 *
 * Había tres caminos que creaban títulos —emitir, renovar e importar— y cada
 * uno repetía por su cuenta lo derivado: folio, token público, importe en letra
 * y fecha de prescripción. Repetido cuatro veces, basta que alguien añada un
 * quinto camino para que se salte lo que los otros cumplen: fue exactamente lo
 * que pasó con la regla de la firma pendiente, que vigilaba la emisión y no la
 * renovación.
 *
 * Aquí vive lo que **todo** pagaré cumple, sin excepción y sin depender de la
 * buena voluntad de quien escriba el siguiente caso de uso.
 */
@Injectable()
export class NoteFactory {
  constructor(private readonly numbering: NumberingService) {}

  async create(
    tx: TxClient,
    draft: NoteDraft,
    origin: NoteOrigin,
    defaults: NoteDefaults,
  ): Promise<CreatedNote> {
    /*
     * Nada nuevo mientras quede algo sin firmar (ADR 0019).
     *
     * Aplica a los caminos que **suman** un título. La importación queda fuera:
     * entra cartera ya firmada en papel, así que no añade pendientes. Y el
     * pagaré que se renueva no cuenta contra sí mismo, porque renovar no suma,
     * cambia uno por otro.
     */
    if (origin !== 'import') {
      await assertNothingUnsigned(tx, draft.debtorPhone, draft.renewedFromId);
    }

    // El folio se numera por el año de la expedición y dentro de la
    // transacción: leerlo fuera dejaría dos pagarés con el mismo número (§4).
    const folio = await this.numbering.next(tx, 'NOTE', Number(draft.issueDate.slice(0, 4)), {
      prefix: defaults.folioPrefix,
      padding: 6,
    });

    const data: NoteData = {
      folio,
      // 128 bits: la vista pública es consultable, no enumerable.
      publicToken: randomBytes(16).toString('hex'),
      status: draft.imported?.status ?? 'PENDING_SIGNATURE',
      issuePlace: draft.issuePlace,
      issueDate: new Date(`${draft.issueDate}T00:00:00Z`),
      paymentPlace: draft.paymentPlace,
      dueDate: new Date(`${draft.dueDate}T00:00:00Z`),
      prescribesOn: new Date(`${addYears(draft.dueDate, defaults.prescriptionYears)}T00:00:00Z`),
      creditorName: draft.creditorName,
      negotiable: draft.negotiable,
      amountCents: draft.amountCents,
      currency: draft.currency ?? 'MXN',
      // El número y la letra los escribe el servidor: si discreparan, el
      // documento sería impugnable (§14).
      amountInWords: amountToWords(draft.amountCents),
      interestRateAnnualPct: draft.interestRateAnnualPct,
      interestPeriod: draft.interestPeriod,
      paymentFrequency: draft.paymentFrequency ?? 'MONTHLY',
      observations: draft.observations ?? null,
      debtorId: draft.debtorId,
      ownerId: draft.ownerId,
      createdBy: draft.createdBy,
    };

    if (draft.requiresGuarantors !== undefined) data.requiresGuarantors = draft.requiresGuarantors;
    if (draft.renewedFromId) data.renewedFromId = draft.renewedFromId;

    if (draft.plan) {
      data.planModel = draft.plan.model;
      data.planInterestCents = draft.plan.interestCents;
      data.planPrincipalCents = draft.plan.principalCents;
      data.planRateAnnualPct = draft.plan.rateAnnualPct;
      data.planRatePeriod = draft.plan.ratePeriod;
    }

    if (draft.imported) {
      data.paidCents = draft.imported.paidCents;
      data.portfolioClass = draft.imported.portfolioClass;
      data.agingBucket = draft.imported.agingBucket;
      data.daysOverdue = draft.imported.daysOverdue;
      // Firmado en papel: no hay trazo digital que custodiar (§25.3).
      data.signatureMode = 'PAPER';
      data.acceptedAt = draft.imported.acceptedAt;
    }

    if (draft.guarantors && draft.guarantors.length > 0) {
      data.guarantors = { create: draft.guarantors };
    }

    if (draft.schedule && draft.schedule.length > 0) {
      data.installments = {
        create: draft.schedule.map((cuota) => ({
          index: cuota.index,
          dueOn: new Date(`${cuota.dueOn}T00:00:00Z`),
          amountCents: cuota.amountCents,
          interestCents: cuota.interestCents,
          principalCents: cuota.principalCents,
        })),
      };
    }

    const note = await tx.promissoryNote.create({
      data,
      select: { id: true, folio: true, publicToken: true, status: true, amountInWords: true },
    });

    return note;
  }
}
