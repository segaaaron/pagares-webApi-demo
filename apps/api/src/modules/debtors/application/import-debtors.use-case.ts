import { Inject, Injectable } from '@nestjs/common';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { createDebtorRequestSchema, type ImportIssue, type ImportResult } from '@pagares/contracts';
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
 * Del campo del schema a la columna del archivo, que es lo que ve quien importa.
 * Decirle «fullName» a quien subió un CSV con la cabecera «nombre» es hacerle
 * traducir nuestro código.
 */
const CAMPO_DEL_CSV: Record<string, string> = {
  fullName: 'nombre',
  address: 'domicilio',
  phone: 'telefono',
  email: 'correo',
  notes: 'notas',
};

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
      /*
       * La fila se valida con **el mismo schema que el alta manual**.
       *
       * Aquí había una copia a mano de esas reglas y ya había divergido: no
       * miraba longitudes máximas, quitaba unos caracteres distintos del
       * teléfono y aceptaba correos que la otra puerta rechazaba. La misma
       * persona entraba o no según por dónde llegara, y el teléfono acababa
       * guardado de dos formas —que es justo el dato con el que este sistema
       * reconoce a alguien (ADR 0019)—.
       */
      const parsed = createDebtorRequestSchema.safeParse({
        fullName: row['nombre'] ?? '',
        address: row['domicilio'] ?? '',
        phone: row['telefono'] ?? '',
        // Vacío es «no tiene», no cadena vacía: el correo es opcional.
        email: (row['correo'] ?? '').trim() || null,
        notes: (row['notas'] ?? '').trim() || null,
      });

      if (!parsed.success) {
        // El mensaje sale del propio schema: si mañana cambia la regla, cambia
        // aquí sin que nadie tenga que acordarse de este archivo.
        const primero = parsed.error.issues[0];
        issues.push({
          row: number,
          field: CAMPO_DEL_CSV[String(primero?.path[0] ?? '')] ?? 'archivo',
          message: primero?.message ?? 'La fila no es válida',
          severity: 'error',
        });
        continue;
      }

      const { fullName, address, phone } = parsed.data;
      const email = parsed.data.email ?? null;

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
        notes: parsed.data.notes ?? null,
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
