import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import type { ArchiveEntry } from '../domain/ports/archive-builder.js';
import { RenderNotePdfUseCase } from './render-note-pdf.use-case.js';

/** Tope deliberado: cien PDFs son ~30 MB y unos segundos de proceso (§22.1). */
const MAX_NOTES = 100;

export interface NotesBundle {
  filename: string;
  /** Cada PDF se dibuja cuando le toca comprimirse, no todos por delante. */
  entries: ArchiveEntry[];
  included: number;
  failed: string[];
}

/**
 * Descarga masiva de pagarés en un zip (§17.2).
 *
 * Existe porque la alternativa real era abrir cien pestañas: cuando el abogado
 * o el contador piden "los pagarés de este deudor", los piden todos.
 *
 * Si uno falla al dibujarse, el zip sale con los demás y su folio en la lista de
 * fallos. Un lote de cien que se cae por uno no sirve para nada.
 */
@Injectable()
export class BundleNotesUseCase extends BaseUseCase<{ noteIds: string[] }, NotesBundle> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderNote: RenderNotePdfUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(BundleNotesUseCase.name));
  }

  protected async handle(
    input: { noteIds: string[] },
    ctx: ExecutionContext,
  ): Promise<NotesBundle> {
    // Repetir un id no es un error del usuario, pero sí produciría dos entradas
    // con el mismo nombre dentro del zip.
    const ids = [...new Set(input.noteIds)];

    if (ids.length === 0) {
      throw new BadRequestException('No se indicó ningún pagaré');
    }
    if (ids.length > MAX_NOTES) {
      throw new BadRequestException(`Máximo ${MAX_NOTES} pagarés por descarga`);
    }

    const notes = await this.prisma.promissoryNote.findMany({
      where: { id: { in: ids } },
      select: { id: true, folio: true },
      orderBy: { folio: 'asc' },
    });

    /*
     * Los PDFs se dibujan de uno en uno mientras se comprime, no los cien por
     * delante: el pico de memoria es el de un documento, no el del lote.
     *
     * El precio es que un fallo al dibujar ya no se puede listar dentro del
     * propio zip —para entonces ya se está escribiendo—, así que se anuncia en
     * la cabecera `X-Bundle-Failed` y el fichero de ese pagaré sale con el
     * motivo dentro.
     */
    const failed: string[] = [];
    const entries: ArchiveEntry[] = notes.map((note) => ({
      name: `${note.folio}.pdf`,
      content: async () => {
        try {
          return await this.renderNote.execute({ id: note.id }, ctx);
        } catch (error) {
          failed.push(note.folio);
          return Buffer.from(
            `No se pudo generar el pagaré ${note.folio}: ${
              error instanceof Error ? error.message : String(error)
            }\n`,
            'utf8',
          );
        }
      },
    }));

    return {
      filename: `pagares-${businessToday(this.clock.now())}.zip`,
      entries,
      included: entries.length,
      failed,
    };
  }
}
