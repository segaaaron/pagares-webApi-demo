import { Injectable } from '@nestjs/common';
import { OVERDUE_PORTFOLIO_THRESHOLD_DAYS } from '@pagares/domain-rules';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import type {
  NoteCounts,
  NoteListQuery,
  NoteListRow,
  NoteRepository,
} from '../domain/ports/note.repository.js';

const DAY_MS = 86_400_000;

/** Días de atraso que abarca cada tramo (§11.1). */
const BUCKET_RANGES: Record<string, { from: number; to: number }> = {
  CURRENT: { from: -36_500, to: 0 },
  D1_30: { from: 1, to: 30 },
  D31_60: { from: 31, to: 60 },
  D61_90: { from: 61, to: 90 },
  D91_120: { from: 91, to: 120 },
  D120_PLUS: { from: 121, to: 36_500 },
};

/**
 * Vencido en SQL: con firma, con saldo y con la fecha pasada. Es la misma
 * definición que `deriveState` aplica en memoria (§11.2); vive aquí una sola
 * vez para que la pestaña y el conteo no puedan discrepar.
 */
function overdueClause(today: Date): Prisma.PromissoryNoteWhereInput {
  return { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueDate: { lt: today } };
}

@Injectable()
export class PrismaNoteRepository implements NoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: NoteListQuery): Promise<NoteListRow[]> {
    const rows = await this.prisma.promissoryNote.findMany({
      where: this.buildWhere(query),
      // El id desempata: sin él, dos filas con la misma fecha se repiten o se
      // pierden al pasar de página.
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: query.limit + 1, // uno de más para saber si hay página siguiente
      select: {
        id: true,
        folio: true,
        status: true,
        collectionStage: true,
        amountCents: true,
        paidCents: true,
        dueDate: true,
        signatureMode: true,
        debtor: { select: { fullName: true } },
        signature: { select: { thumbAssetId: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      folio: row.folio,
      status: row.status,
      collectionStage: row.collectionStage,
      debtorName: row.debtor.fullName,
      amountCents: row.amountCents,
      paidCents: row.paidCents,
      dueDate: row.dueDate.toISOString().slice(0, 10),
      signatureThumbKey: row.signature?.thumbAssetId ?? null,
      signatureMode: row.signatureMode,
    }));
  }

  /**
   * Cuántos coinciden con el filtro. El cursor se ignora a propósito: el conteo
   * es del filtro completo, no de la página que se está viendo.
   */
  async count(query: NoteListQuery): Promise<NoteCounts> {
    const { cursor: _cursor, ...withoutCursor } = query;
    const where = this.buildWhere(withoutCursor);

    const [total, overdue] = await Promise.all([
      this.prisma.promissoryNote.count({ where }),
      this.prisma.promissoryNote.count({
        where: { AND: [where, overdueClause(new Date(`${query.today}T00:00:00Z`))] },
      }),
    ]);
    return { total, overdue };
  }

  /** Las pestañas de §19.4 son filtros sobre la misma consulta, no pantallas. */
  private buildWhere(query: NoteListQuery): Prisma.PromissoryNoteWhereInput {
    const where: Prisma.PromissoryNoteWhereInput = {};
    const today = new Date(`${query.today}T00:00:00Z`);

    switch (query.tab) {
      case 'por-firmar':
        where.status = { in: ['PENDING_SIGNATURE', 'PROCESSING_SIGNATURE'] };
        break;
      case 'vigentes':
        where.status = { in: ['ISSUED', 'PARTIALLY_PAID'] };
        where.dueDate = { gte: today };
        break;
      case 'por-vencer':
        where.status = { in: ['ISSUED', 'PARTIALLY_PAID'] };
        where.dueDate = { gte: today, lte: new Date(today.getTime() + 7 * DAY_MS) };
        break;
      case 'vencidos':
        // Por fecha, no por la columna `status`: sin proceso nocturno nadie
        // mueve ISSUED a OVERDUE, así que esa columna nunca dice "vencido".
        Object.assign(where, overdueClause(today));
        break;
      case 'cartera-vencida':
        // Cartera vencida son 90 días naturales sin pago. Se resuelve por fecha,
        // no por una columna precalculada que nadie refresca.
        where.dueDate = { lt: new Date(today.getTime() - OVERDUE_PORTFOLIO_THRESHOLD_DAYS * DAY_MS) };
        where.status = { notIn: ['PAID', 'VOID', 'RENEWED'] };
        break;
      case 'en-convenio':
        where.status = 'RESTRUCTURED';
        break;
      case 'en-juicio':
        where.inLitigation = true;
        break;
      case 'pagados':
        where.status = 'PAID';
        break;
      case 'renovados':
        where.status = 'RENEWED';
        break;
      case 'castigados':
        where.status = 'WRITTEN_OFF';
        break;
      case 'anulados':
        where.status = 'VOID';
        break;
      default:
        break;
    }

    if (query.bucket) {
      const range = BUCKET_RANGES[query.bucket];
      if (range) {
        where.dueDate = {
          gte: new Date(today.getTime() - range.to * DAY_MS),
          lte: new Date(today.getTime() - range.from * DAY_MS),
        };
      }
    }

    if (query.from || query.to) {
      where.issueDate = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
      };
    }

    if (query.q) {
      const q = query.q.trim();
      where.AND = [
        {
          OR: [
            { folio: { contains: q, mode: 'insensitive' } },
            { debtor: { fullName: { contains: q, mode: 'insensitive' } } },
            { debtor: { phone: { contains: q } } },
          ],
        },
      ];
    }

    if (query.cursor) {
      const cursorDate = new Date(`${query.cursor.value}T00:00:00Z`);
      where.OR = [{ dueDate: { gt: cursorDate } }, { dueDate: cursorDate, id: { gt: query.cursor.id } }];
    }

    return where;
  }
}
