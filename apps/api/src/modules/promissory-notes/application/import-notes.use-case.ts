import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import type { ImportIssue, ImportResult } from '@pagares/contracts';
import {
  addYears,
  amountToWords,
  businessToday,
  classifyAging,
  classifyPortfolio,
  daysOverdue,
  toAnnualRatePct,
} from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { NumberingService } from '../../numbering/numbering.service.js';
import { parseCsv } from '../../../shared/domain/csv.js';
import { deriveState } from '../domain/note-status.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';

export interface ImportNotesInput {
  csv: string;
  commit: boolean;
}

interface Candidate {
  row: number;
  debtorId: string;
  ownerId: string | null;
  amountCents: bigint;
  paidCents: bigint;
  issueDate: string;
  dueDate: string;
  annualRatePct: number | null;
  period: 'MONTHLY' | 'ANNUAL';
  originalFolio: string | null;
}

const REQUIRED = ['telefono_deudor', 'importe', 'fecha_emision', 'vencimiento'] as const;

/**
 * Importación de pagarés existentes desde CSV (§24.5).
 *
 * Tres decisiones que no son obvias:
 *
 * · **No manda ni un correo.** Importar 300 pagarés viejos no es emitirlos: el
 *   deudor ya firmó en papel y avisarle otra vez sería spam con su propia deuda.
 *   Por eso no reutiliza `IssueNoteUseCase`, que sí publica `NoteIssued`.
 *
 * · **El folio lo sigue generando el servidor** (§4). El del papel se guarda en
 *   las observaciones, porque es dato histórico y no una clave: dos carpetas
 *   distintas traen folios repetidos y la unicidad la sostiene el sistema.
 *
 * · **Entran como firmados en papel**: `signatureMode = PAPER`, sin firma
 *   digital ni certificado de evidencia. Fingir una firma electrónica que nunca
 *   existió destruiría el valor probatorio del resto (§24.1).
 */
@Injectable()
export class ImportNotesUseCase extends BaseUseCase<ImportNotesInput, ImportResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ImportNotesUseCase.name));
  }

  protected async handle(input: ImportNotesInput, ctx: ExecutionContext): Promise<ImportResult> {
    const table = parseCsv(input.csv);
    const issues: ImportIssue[] = [];

    for (const column of REQUIRED) {
      if (!table.headers.includes(column)) {
        issues.push({
          row: 1,
          field: column,
          message: `Falta la columna "${column}". Se esperan: ${REQUIRED.join(', ')}, abonado, tasa, periodo_tasa, folio_original`,
          severity: 'error',
        });
      }
    }
    if (issues.length > 0) {
      return { rows: table.rows.length, valid: 0, duplicates: 0, issues, created: null, committed: false };
    }

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { id: 'singleton' },
    });
    const phones = table.rows.map((row) => (row['telefono_deudor'] ?? '').replace(/[\s()-]/g, ''));
    const debtors = await this.prisma.debtor.findMany({
      where: { phone: { in: phones } },
      select: { id: true, phone: true, userId: true },
    });
    const byPhone = new Map(debtors.map((debtor) => [debtor.phone, debtor]));

    const candidates: Candidate[] = [];

    for (const [index, row] of table.rows.entries()) {
      const number = index + 2;
      const phone = (row['telefono_deudor'] ?? '').replace(/[\s()-]/g, '');
      const debtor = byPhone.get(phone);

      if (!debtor) {
        issues.push({
          row: number,
          field: 'telefono_deudor',
          message: 'No hay ningún deudor con ese teléfono: impórtalos primero',
          severity: 'error',
        });
        continue;
      }

      const amountCents = toCents(row['importe'] ?? '');
      if (amountCents === null || amountCents <= 0n) {
        issues.push({
          row: number,
          field: 'importe',
          message: 'El importe debe ser un número positivo, como 25000.00',
          severity: 'error',
        });
        continue;
      }

      const paidCents = row['abonado'] ? toCents(row['abonado']) : 0n;
      if (paidCents === null || paidCents < 0n) {
        issues.push({ row: number, field: 'abonado', message: 'Lo abonado no es un número', severity: 'error' });
        continue;
      }
      if (paidCents > amountCents) {
        issues.push({
          row: number,
          field: 'abonado',
          message: 'Lo abonado supera el importe del pagaré',
          severity: 'error',
        });
        continue;
      }

      const issueDate = normalizeDate(row['fecha_emision'] ?? '');
      const dueDate = normalizeDate(row['vencimiento'] ?? '');
      if (!issueDate || !dueDate) {
        issues.push({
          row: number,
          field: issueDate ? 'vencimiento' : 'fecha_emision',
          message: 'La fecha debe ser AAAA-MM-DD o DD/MM/AAAA',
          severity: 'error',
        });
        continue;
      }
      if (dueDate < issueDate) {
        issues.push({
          row: number,
          field: 'vencimiento',
          message: 'El vencimiento es anterior a la emisión',
          severity: 'error',
        });
        continue;
      }

      const rawRate = row['tasa'] ?? '';
      const rate = rawRate === '' ? null : Number(rawRate.replace(',', '.'));
      if (rate !== null && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
        issues.push({ row: number, field: 'tasa', message: 'La tasa debe ir entre 0 y 100', severity: 'error' });
        continue;
      }

      candidates.push({
        row: number,
        debtorId: debtor.id,
        // Si el deudor ya tiene cuenta, el pagaré importado es suyo también en
        // la aplicación: sin dueño no lo vería nadie desde el iPhone (§25.2).
        ownerId: debtor.userId,
        amountCents,
        paidCents,
        issueDate,
        dueDate,
        annualRatePct: rate,
        period: (row['periodo_tasa'] ?? '').toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
        originalFolio: (row['folio_original'] ?? '') || null,
      });
    }

    // Duplicado: mismo deudor, mismo importe y mismo vencimiento. Es la firma
    // de "este archivo ya se importó", que es el accidente más probable.
    const existing = await this.prisma.promissoryNote.findMany({
      where: {
        debtorId: { in: candidates.map((candidate) => candidate.debtorId) },
        dueDate: { in: candidates.map((candidate) => new Date(`${candidate.dueDate}T00:00:00Z`)) },
      },
      select: { debtorId: true, amountCents: true, dueDate: true },
    });
    const taken = new Set(
      existing.map(
        (note) =>
          `${note.debtorId}:${note.amountCents.toString()}:${note.dueDate.toISOString().slice(0, 10)}`,
      ),
    );

    const fresh = candidates.filter((candidate) => {
      const key = `${candidate.debtorId}:${candidate.amountCents.toString()}:${candidate.dueDate}`;
      if (taken.has(key)) {
        issues.push({
          row: candidate.row,
          field: 'importe',
          message: 'Ya existe un pagaré igual de ese deudor con ese vencimiento: la fila se omite',
          severity: 'conflict',
        });
        return false;
      }
      return true;
    });

    const result: ImportResult = {
      rows: table.rows.length,
      valid: fresh.length,
      duplicates: candidates.length - fresh.length,
      issues,
      created: null,
      committed: false,
    };

    if (!input.commit) return result;
    if (issues.some((issue) => issue.severity === 'error')) return result;

    const now = this.clock.now();
    const today = businessToday(now);
    const prescriptionYears = settings?.prescriptionYears ?? 3;

    return this.uow.run(async (scope) => {
      const tx = scope.client;

      for (const candidate of fresh) {
        const folio = await this.numbering.next(tx, 'NOTE', Number(candidate.issueDate.slice(0, 4)), {
          prefix: settings?.noteFolioPrefix ?? 'PAG',
          padding: 6,
        });

        const overdue = daysOverdue(candidate.dueDate, now);
        const balance = candidate.amountCents - candidate.paidCents;

        const created = await tx.promissoryNote.create({
          data: {
            folio,
            publicToken: randomBytes(16).toString('hex'),
            // El estado se deriva del saldo y del reloj, igual que en el resto
            // del sistema: importar no es una vía para teclear un estado (§11.2).
            status: deriveState({
              amountCents: candidate.amountCents,
              paidCents: candidate.paidCents,
              daysOverdue: overdue,
              // Firmado en papel: por eso entra ya emitido y no "por firmar".
              hasSignature: true,
              signatureProcessing: false,
              voidedAt: null,
              writtenOffAt: null,
              renewedById: null,
              hasActiveSettlement: false,
            }).status,
            portfolioClass: classifyPortfolio(overdue),
            agingBucket: classifyAging(overdue),
            daysOverdue: overdue,
            issuePlace: settings?.defaultIssuePlace ?? 'Morelia, Michoacán',
            issueDate: new Date(`${candidate.issueDate}T00:00:00Z`),
            paymentPlace: settings?.defaultPaymentPlace ?? 'Morelia, Michoacán',
            dueDate: new Date(`${candidate.dueDate}T00:00:00Z`),
            creditorName: settings?.legalName ?? 'Créditos Morelia',
            amountCents: candidate.amountCents,
            amountInWords: amountToWords(candidate.amountCents),
            interestRateAnnualPct:
              candidate.annualRatePct === null
                ? null
                : toAnnualRatePct(candidate.annualRatePct, candidate.period),
            interestPeriod: candidate.period,
            paidCents: candidate.paidCents,
            debtorId: candidate.debtorId,
            ownerId: candidate.ownerId,
            // Firmado en papel: no hay trazo digital que custodiar (§25.3).
            signatureMode: 'PAPER',
            acceptedAt: new Date(`${candidate.issueDate}T00:00:00Z`),
            prescribesOn: new Date(
              `${addYears(candidate.dueDate, prescriptionYears)}T00:00:00Z`,
            ),
            observations: candidate.originalFolio
              ? `Importado de la cartera anterior. Folio original: ${candidate.originalFolio}`
              : 'Importado de la cartera anterior.',
            createdBy: ctx.actorId ?? 'system',
          },
        });

        if (balance < 0n) {
          // No debería ocurrir: la validación lo impide. Si ocurre, se corta la
          // transacción entera antes de dejar un saldo imposible en la base.
          throw new Error(`El pagaré de la fila ${candidate.row} quedaría con saldo negativo`);
        }

        /*
         * Lo ya abonado entra como un asiento de apertura, no como un número
         * suelto en `paidCents`. El libro de abonos es la verdad (§12.2): sin
         * esta fila, la reconciliación semanal vería un saldo que ningún abono
         * explica y lo marcaría como descuadre.
         */
        if (candidate.paidCents > 0n) {
          await tx.payment.create({
            data: {
              noteId: created.id,
              amountCents: candidate.paidCents,
              appliedToPrincipalCents: candidate.paidCents,
              paidOn: new Date(`${candidate.issueDate}T00:00:00Z`),
              method: 'OTHER',
              memo: 'Saldo abonado en la cartera anterior, importado como asiento de apertura',
              registeredBy: ctx.actorId ?? 'system',
            },
          });
        }
      }

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'notes.import',
          targetType: 'PromissoryNote',
          targetId: 'bulk',
          metadata: { created: fresh.length, duplicates: result.duplicates, on: today },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        tx,
      );

      return { ...result, created: fresh.length, committed: true };
    });
  }
}

/** "25,000.50" · "25000" · "$25 000.50" → centavos enteros. */
function toCents(raw: string): bigint | null {
  const cleaned = raw.replace(/[$\s]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const normalized = cleaned.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const [pesos, centavos = ''] = normalized.split('.');
  // Se compone con enteros: `Number(...) * 100` convierte 25000.10 en 2500009.
  return BigInt(pesos ?? '0') * 100n + BigInt(centavos.padEnd(2, '0') || '0');
}

/** Acepta el formato ISO y el que escribe Excel en español. */
function normalizeDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;

  const spanish = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!spanish) return null;

  const [, day, month, year] = spanish as unknown as [string, string, string, string];
  const padded = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${padded}T00:00:00Z`)) ? null : padded;
}
