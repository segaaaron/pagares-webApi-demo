import { Inject, Injectable } from '@nestjs/common';
import {
  BaseUseCase,
  CLOCK,
  decodeCursor,
  encodeCursor,
  type Clock,
  type ExecutionContext,
} from '@pagares/api-core';
import type { ListNotesQuery, NoteSummary, Paginated } from '@pagares/contracts';
import { businessToday, classifyAging, classifyPortfolio, daysOverdue, money } from '@pagares/domain-rules';
import { withClock } from '../domain/note-status.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../media/domain/ports/object-storage.js';
import { NOTE_REPOSITORY, type NoteListQuery, type NoteRepository } from '../domain/ports/note.repository.js';

/**
 * Listado de la cartera (§19.3).
 *
 * El orden por defecto es vencimiento ascendente: la pregunta al abrir el
 * sistema es "qué vence primero", no "qué se registró último".
 */
export interface NotesPage extends Paginated<NoteSummary> {
  counts: { total: number; overdue: number };
}

@Injectable()
export class ListNotesUseCase extends BaseUseCase<ListNotesQuery, NotesPage> {
  constructor(
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(ListNotesUseCase.name));
  }

  protected async handle(input: ListNotesQuery, _ctx: ExecutionContext): Promise<NotesPage> {
    const now = this.clock.now();
    const today = businessToday(now);

    const query: NoteListQuery = {
      tab: input.tab,
      q: input.q,
      bucket: input.bucket,
      from: input.from,
      to: input.to,
      dueFrom: input.dueFrom,
      dueTo: input.dueTo,
      limit: input.limit,
      cursor: input.cursor ? (decodeCursor(input.cursor) ?? undefined) : undefined,
      today,
    };

    const [rows, counts] = await Promise.all([this.notes.list(query), this.notes.count(query)]);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const data = await Promise.all(
      page.map(async (row): Promise<NoteSummary> => {
        const balance = row.amountCents - row.paidCents;

        // Los tres se derivan del reloj, así que se calculan al leer. Guardarlos
        // exigiría un trabajo diario que los refrescara, y sin él mentirían: un
        // pagaré con 95 días de atraso mostraría el tramo que tenía al guardarse.
        const overdue = daysOverdue(row.dueDate, now);

        return {
          id: row.id,
          folio: row.folio,
          status: withClock(row.status, overdue),
          portfolioClass: classifyPortfolio(overdue),
          agingBucket: classifyAging(overdue),
          collectionStage: row.collectionStage,
          debtorName: row.debtorName,
          debtorPhone: row.debtorPhone,
          amount: money(row.amountCents),
          paid: money(row.paidCents),
          balance: money(balance),
          dueDate: row.dueDate,
          daysOverdue: overdue,
          // El pagaré importado se firmó en papel: no tiene miniatura y sí está
          // firmado. Mirar sólo la miniatura lo mostraría "por firmar" para
          // siempre, y aparecería en la cola de pendientes de Hoy.
          hasSignature: row.signatureThumbKey !== null || row.signatureMode === 'PAPER',
          // URL temporal: el bucket es privado y copiar la dirección no da acceso.
          signatureThumbUrl: row.signatureThumbKey ? await this.storage.signedUrl(row.signatureThumbKey) : null,
        };
      }),
    );

    const last = page.at(-1);
    return {
      data,
      counts,
      page: {
        hasMore,
        limit: input.limit,
        nextCursor: hasMore && last ? encodeCursor({ value: last.dueDate, id: last.id }) : null,
      },
    };
  }
}
