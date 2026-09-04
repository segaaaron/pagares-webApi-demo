import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday, formatMxn } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../media/domain/ports/object-storage.js';
import type { ArchiveEntry } from '../domain/ports/archive-builder.js';
import { RenderNotePdfUseCase } from './render-note-pdf.use-case.js';
import {
  RenderEvidenceUseCase,
  RenderStatementUseCase,
} from './render-documents.use-case.js';

export interface LegalPackage {
  filename: string;
  /**
   * Qué va dentro y cómo obtenerlo. El zip lo escribe el adaptador directamente
   * en la respuesta: armarlo aquí en memoria costaba el tamaño del expediente
   * entero, y los escaneos pesan hasta 20 MB cada uno (§8.3).
   */
  entries: ArchiveEntry[];
  /** Qué acabó dentro: el abogado necesita saber si falta algo. */
  contents: string[];
  missing: string[];
}

const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

/**
 * Paquete legal en zip (§24.5).
 *
 * Es lo que pide el abogado para demandar: el pagaré, el certificado de cómo se
 * firmó, el estado de cuenta, la bitácora de gestión y los escaneos del
 * expediente. Se arma en una sola descarga porque recopilarlo a mano es donde se
 * olvida una pieza, y la que se olvida siempre es la bitácora.
 *
 * Si un documento no se puede generar —un pagaré sin firma no tiene
 * certificado— **el paquete sale igual** y dice qué falta: media demanda con una
 * lista de huecos es más útil que un error.
 */
@Injectable()
export class BuildLegalPackageUseCase extends BaseUseCase<{ noteId: string }, LegalPackage> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderNote: RenderNotePdfUseCase,
    private readonly renderEvidence: RenderEvidenceUseCase,
    private readonly renderStatement: RenderStatementUseCase,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(BuildLegalPackageUseCase.name));
  }

  protected async handle(
    input: { noteId: string },
    ctx: ExecutionContext,
  ): Promise<LegalPackage> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      include: {
        debtor: true,
        activities: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { paidOn: 'asc' } },
        legalCase: { include: { actions: { orderBy: { occurredOn: 'asc' } } } },
      },
    });
    if (!note) throw new NotFoundException('El pagaré no existe');

    const entries: ArchiveEntry[] = [];
    const contents: string[] = [];
    const missing: string[] = [];

    const add = async (name: string, produce: () => Promise<Buffer>): Promise<void> => {
      try {
        entries.push({ name, content: await produce() });
        contents.push(name);
      } catch (error) {
        // El motivo entra en el propio zip: quien lo abra sabrá por qué falta.
        missing.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    await add('01-pagare.pdf', () => this.renderNote.execute({ id: note.id }, ctx));
    await add('02-certificado-de-evidencia.pdf', () =>
      this.renderEvidence.execute({ noteId: note.id }, ctx),
    );
    await add('03-estado-de-cuenta.pdf', () =>
      this.renderStatement.execute({ debtorId: note.debtorId }, ctx),
    );

    entries.push({ name: '04-bitacora-de-gestion.csv', content: this.activityLog(note) });
    contents.push('04-bitacora-de-gestion.csv');

    // Escaneos del expediente, con el perfil `legal-exhibit` (§8.3).
    const assetIds = (note.legalCase?.actions ?? []).flatMap((action) => action.assetIds);
    if (assetIds.length > 0) {
      const assets = await this.prisma.mediaAsset.findMany({ where: { id: { in: assetIds } } });
      for (const [index, asset] of assets.entries()) {
        const extension = asset.contentType.split('/')[1] ?? 'bin';
        const name = `05-escaneos/${String(index + 1).padStart(2, '0')}.${extension}`;
        // Perezoso: el escaneo se baja del almacenamiento cuando le toca
        // comprimirse, no ahora. Diez de 20 MB no pueden coincidir en memoria.
        entries.push({ name, content: () => this.storage.get(asset.storageKey) });
        contents.push(name);
      }
    }

    if (missing.length > 0) {
      entries.push({ name: '00-FALTAN-ESTAS-PIEZAS.txt', content: missing.join('\n') });
    }

    // Armar el paquete legal es un acto sensible: se anota quién se llevó qué (§9.3).
    await this.audit.record({
      actorId: ctx.actorId ?? 'system',
      actorRole: ctx.actorRole,
      action: 'note.legal_package',
      targetType: 'PromissoryNote',
      targetId: note.id,
      metadata: { contents, missing },
      ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
    });

    return {
      filename: `paquete-legal-${note.folio}-${businessToday(this.clock.now())}.zip`,
      entries,
      contents,
      missing,
    };
  }

  /**
   * Bitácora en CSV y no en PDF: el abogado la cruza con sus fechas, y para eso
   * una tabla que se abre en una hoja de cálculo sirve más que una página bonita.
   */
  private activityLog(note: {
    folio: string;
    activities: {
      createdAt: Date;
      type: string;
      outcome: string;
      promisedOn: Date | null;
      notes: string | null;
    }[];
    payments: {
      paidOn: Date;
      amountCents: bigint;
      method: string;
      reference: string | null;
      reversalOfId: string | null;
    }[];
    legalCase: { actions: { occurredOn: Date; description: string }[] } | null;
  }): string {
    const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
    const rows: string[][] = [['Fecha', 'Tipo', 'Detalle', 'Importe']];

    for (const activity of note.activities) {
      rows.push([
        DATE_TIME.format(activity.createdAt),
        `Gestión · ${activity.type}`,
        [
          activity.outcome,
          activity.promisedOn
            ? `promesa para ${activity.promisedOn.toISOString().slice(0, 10)}`
            : null,
          activity.notes,
        ]
          .filter(Boolean)
          .join(' · '),
        '',
      ]);
    }

    for (const payment of note.payments) {
      rows.push([
        payment.paidOn.toISOString().slice(0, 10),
        payment.reversalOfId !== null ? 'Reversa de abono' : 'Abono',
        [payment.method, payment.reference].filter(Boolean).join(' · '),
        formatMxn(payment.amountCents),
      ]);
    }

    for (const action of note.legalCase?.actions ?? []) {
      rows.push([
        action.occurredOn.toISOString().slice(0, 10),
        'Actuación judicial',
        action.description,
        '',
      ]);
    }

    return rows.map((row) => row.map(escape).join(',')).join('\n');
  }
}
