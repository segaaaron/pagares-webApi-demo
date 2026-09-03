import { Inject, Injectable } from '@nestjs/common';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import type { ImportIssue, ImportResult } from '@pagares/contracts';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { parseCsv } from '../../../shared/domain/csv.js';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';

export interface ImportDebtorsInput {
  csv: string;
  commit: boolean;
}

interface Candidate {
  row: number;
  fullName: string;
  address: string;
  phone: string;
  email: string | null;
  notes: string | null;
}

const REQUIRED = ['nombre', 'domicilio', 'telefono'] as const;

/**
 * Importación de deudores desde CSV (§24.5).
 *
 * Dos pasadas por diseño: la primera valida y devuelve los conflictos, la
 * segunda escribe. Y la escritura es una sola transacción —o entran todos o no
 * entra ninguno—: media cartera importada es peor que ninguna, porque nadie sabe
 * dónde se cortó.
 *
 * El duplicado no se sobreescribe. Un deudor ya dado de alta puede tener
 * pagarés, abonos y bitácora; machacar su domicilio con lo que trajera un Excel
 * sería perder datos sin dejar rastro (§7).
 */
@Injectable()
export class ImportDebtorsUseCase extends BaseUseCase<ImportDebtorsInput, ImportResult> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ImportDebtorsUseCase.name));
  }

  protected async handle(input: ImportDebtorsInput, ctx: ExecutionContext): Promise<ImportResult> {
    const table = parseCsv(input.csv);
    const issues: ImportIssue[] = [];

    for (const column of REQUIRED) {
      if (!table.headers.includes(column)) {
        issues.push({
          row: 1,
          field: column,
          message: `Falta la columna "${column}". Se esperan: ${REQUIRED.join(', ')}, correo, notas`,
          severity: 'error',
        });
      }
    }
    if (issues.length > 0) {
      return { rows: table.rows.length, valid: 0, duplicates: 0, issues, created: null, committed: false };
    }

    const candidates: Candidate[] = [];
    const seenPhones = new Set<string>();

    for (const [index, row] of table.rows.entries()) {
      // +2: la cabecera es la fila 1 y el índice empieza en cero.
      const number = index + 2;
      const fullName = row['nombre'] ?? '';
      const address = row['domicilio'] ?? '';
      const phone = (row['telefono'] ?? '').replace(/[\s()-]/g, '');
      const email = (row['correo'] ?? '').toLowerCase() || null;

      if (fullName.length < 3) {
        issues.push({ row: number, field: 'nombre', message: 'El nombre es demasiado corto', severity: 'error' });
        continue;
      }
      if (address.length < 3) {
        issues.push({ row: number, field: 'domicilio', message: 'El domicilio es obligatorio', severity: 'error' });
        continue;
      }
      if (!/^\+?\d{7,15}$/.test(phone)) {
        issues.push({
          row: number,
          field: 'telefono',
          message: 'El teléfono debe tener entre 7 y 15 dígitos',
          severity: 'error',
        });
        continue;
      }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        issues.push({ row: number, field: 'correo', message: 'El correo no es válido', severity: 'error' });
        continue;
      }
      if (seenPhones.has(phone)) {
        issues.push({
          row: number,
          field: 'telefono',
          message: 'Ese teléfono aparece dos veces en el archivo',
          severity: 'conflict',
        });
        continue;
      }
      seenPhones.add(phone);

      candidates.push({
        fullName,
        address,
        phone,
        email,
        notes: (row['notas'] ?? '') || null,
        row: number,
      });
    }

    // El duplicado se busca por teléfono, que es el dato que siempre viene, y
    // por correo cuando lo hay: dos personas pueden llamarse igual.
    const existing = await this.prisma.debtor.findMany({
      where: {
        OR: [
          { phone: { in: candidates.map((candidate) => candidate.phone) } },
          {
            email: {
              in: candidates
                .map((candidate) => candidate.email)
                .filter((email): email is string => email !== null),
            },
          },
        ],
      },
      select: { phone: true, email: true },
    });
    const takenPhones = new Set(existing.map((debtor) => debtor.phone));
    const takenEmails = new Set(existing.map((debtor) => debtor.email).filter(Boolean));

    const fresh = candidates.filter((candidate) => {
      const duplicated =
        takenPhones.has(candidate.phone) || (candidate.email && takenEmails.has(candidate.email));
      if (duplicated) {
        issues.push({
          row: candidate.row,
          field: 'telefono',
          message: 'Ese deudor ya está dado de alta: la fila se omite',
          severity: 'conflict',
        });
      }
      return !duplicated;
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
    if (issues.some((issue) => issue.severity === 'error')) {
      // Con errores no se importa nada: corregir el archivo es más barato que
      // arreglar a mano las filas que sí entraron.
      return result;
    }

    return this.uow.run(async (scope) => {
      await scope.client.debtor.createMany({
        data: fresh.map((candidate) => ({
          fullName: candidate.fullName,
          address: candidate.address,
          phone: candidate.phone,
          email: candidate.email,
          notes: candidate.notes,
        })),
      });

      await this.audit.record(
        {
          actorId: ctx.actorId ?? 'system',
          actorRole: ctx.actorRole,
          action: 'debtors.import',
          targetType: 'Debtor',
          targetId: 'bulk',
          metadata: {
            created: fresh.length,
            duplicates: result.duplicates,
            at: this.clock.now().toISOString(),
          },
          ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
        },
        scope.client,
      );

      return { ...result, created: fresh.length, committed: true };
    });
  }
}
