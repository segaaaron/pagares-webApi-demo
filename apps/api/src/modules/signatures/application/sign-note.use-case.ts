import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BaseUseCase,
  CLOCK,
  UNIT_OF_WORK,
  type Clock,
  type ExecutionContext,
  type UnitOfWork,
} from '@pagares/api-core';
import { businessToday, daysOverdue } from '@pagares/domain-rules';
import type { TxClient } from '../../../shared/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { AuditService } from '../../../shared/persistence/audit.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../media/domain/ports/object-storage.js';
import { IMAGE_COMPRESSOR, type ImageCompressor } from '../../media/domain/ports/image-compressor.js';
import { deriveState } from '../../promissory-notes/domain/note-status.js';
import { SignatureReusedError } from '../domain/signature.errors.js';
import { InvalidStatusTransitionError } from '../../promissory-notes/domain/note.errors.js';

export interface SignNoteInput {
  noteId: string;
  signaturePng: Buffer;
  signatureVector?: Buffer | undefined;
  capture: {
    capturedAt: string;
    strokeCount?: number | undefined;
    durationMs?: number | undefined;
    inputType?: string | undefined;
    /** Si el aparato verificó al firmante antes del trazo. Nulo: no se sabe. */
    biometricVerified?: boolean | undefined;
    deviceModel?: string | undefined;
    osVersion?: string | undefined;
    appVersion?: string | undefined;
    scrolledToEndAt?: string | undefined;
  };
  mode: 'REMOTE' | 'IN_PERSON';
}

export interface SignNoteOutput {
  noteId: string;
  status: string;
  sha256: string;
  byteSize: number;
}

/**
 * Firma de un pagaré (§8).
 *
 * Es la única escritura que puede hacer el cliente. Junta tres cosas que deben
 * ocurrir a la vez: la evidencia de captura, la imagen comprimida y el cambio de
 * estado. Si la persistencia falla después de subir, el objeto se borra: el
 * almacenamiento no participa del ROLLBACK y hay que compensarlo a mano.
 */
@Injectable()
export class SignNoteUseCase extends BaseUseCase<SignNoteInput, SignNoteOutput> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IMAGE_COMPRESSOR) private readonly compressor: ImageCompressor,
    private readonly audit: AuditService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork<TxClient>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(SignNoteUseCase.name));
  }

  protected override async authorize(input: SignNoteInput, ctx: ExecutionContext): Promise<void> {
    const note = await this.prisma.promissoryNote.findUnique({
      where: { id: input.noteId },
      select: { ownerId: true },
    });
    if (!note) throw new NotFoundException();

    // El cliente sólo firma lo suyo; la firma presencial la habilita el admin
    // en su propio dispositivo (§25.11).
    if (ctx.actorRole === 'CLIENT' && note.ownerId !== ctx.actorId) throw new ForbiddenException();
    if (ctx.actorRole === 'CLIENT' && input.mode === 'IN_PERSON') throw new ForbiddenException();
  }

  protected async handle(input: SignNoteInput, ctx: ExecutionContext): Promise<SignNoteOutput> {
    const now = this.clock.now();

    const note = await this.prisma.promissoryNote.findUniqueOrThrow({
      where: { id: input.noteId },
      include: { signature: true },
    });
    if (note.status !== 'PENDING_SIGNATURE' || note.signature) {
      throw new InvalidStatusTransitionError(note.status, 'ISSUED');
    }

    const image = await this.compressor.compress(input.signaturePng, 'signature');

    /*
     * La misma firma no se repite en ningún pagaré (ADR 0021).
     *
     * Dos títulos con la imagen idéntica al byte no son dos firmas: son una
     * copiada. Nadie dibuja dos veces exactamente lo mismo —cambian el pulso,
     * los puntos y hasta la compresión—, así que cuando el hash coincide es que
     * se reenvió el trazo anterior, y eso convierte doce actos de voluntad en
     * uno solo replicado.
     */
    const yaUsada = await this.prisma.signature.findFirst({
      where: { sha256: image.sha256, noteId: { not: note.id } },
      select: { note: { select: { folio: true } } },
    });
    if (yaUsada) throw new SignatureReusedError(yaUsada.note.folio);
    const key = `signatures/${note.id}/${image.sha256}.webp`;
    const thumbKey = `signatures/${note.id}/${image.sha256}-thumb.webp`;
    const vectorKey = `signatures/${note.id}/${image.sha256}.pkdrawing`;

    await this.storage.put(key, image.full, 'image/webp');
    if (image.thumb) await this.storage.put(thumbKey, image.thumb, 'image/webp');
    if (input.signatureVector) {
      await this.storage.put(vectorKey, input.signatureVector, 'application/octet-stream');
    }

    try {
      return await this.uow.run(async (scope) => {
        const tx = scope.client;
        await tx.mediaAsset.create({
          data: {
            profile: 'signature',
            storageKey: key,
            contentType: 'image/webp',
            byteSize: image.byteSize,
            width: image.width,
            height: image.height,
            sha256: image.sha256,
          },
        });

        await tx.signature.create({
          data: {
            noteId: note.id,
            assetId: key,
            thumbAssetId: image.thumb ? thumbKey : null,
            vectorAssetId: input.signatureVector ? vectorKey : null,
            sha256: image.sha256,
            width: image.width,
            height: image.height,
            byteSize: image.byteSize,
            capturedAt: new Date(input.capture.capturedAt),
            strokeCount: input.capture.strokeCount ?? null,
            durationMs: input.capture.durationMs ?? null,
            inputType: input.capture.inputType ?? null,
            // Nulo cuando el aparato no tiene biometría: no afirmar nada es
            // distinto de afirmar que falló (§24.1).
            biometricVerified: input.capture.biometricVerified ?? null,
            deviceModel: input.capture.deviceModel ?? null,
            osVersion: input.capture.osVersion ?? null,
            appVersion: input.capture.appVersion ?? null,
            ipAddress: ctx.ip ?? null,
            mode: input.mode,
            enabledBy: input.mode === 'IN_PERSON' ? ctx.actorId : null,
          },
        });

        const overdue = daysOverdue(note.dueDate.toISOString().slice(0, 10), now);
        const derived = deriveState({
          amountCents: note.amountCents,
          paidCents: note.paidCents,
          daysOverdue: overdue,
          hasSignature: true,
          signatureProcessing: false,
          voidedAt: null,
          writtenOffAt: null,
          renewedById: null,
          hasActiveSettlement: false,
        });

        await tx.promissoryNote.update({
          where: { id: note.id },
          data: {
            status: derived.status,
            portfolioClass: derived.portfolioClass,
            agingBucket: derived.agingBucket,
            daysOverdue: overdue,
            signatureMode: input.mode,
            acceptedAt: now,
            scrolledToEndAt: input.capture.scrolledToEndAt
              ? new Date(input.capture.scrolledToEndAt)
              : null,
          },
        });

        await this.audit.record(
          {
            actorId: ctx.actorId ?? 'system',
            actorRole: ctx.actorRole,
            action: 'note.sign',
            targetType: 'PromissoryNote',
            targetId: note.id,
            metadata: { mode: input.mode, sha256: image.sha256 },
            ...(ctx.ip !== undefined ? { ip: ctx.ip } : {}),
          },
          tx,
        );

        scope.publish({
          eventId: randomUUID(),
          eventType: 'NoteSigned',
          occurredAt: now,
          payload: { noteId: note.id, folio: note.folio, signedOn: businessToday(now) },
        });

        return {
          noteId: note.id,
          status: derived.status,
          sha256: image.sha256,
          byteSize: image.byteSize,
        };
      });
    } catch (error) {
      // Compensación: sin esto quedaría una firma que ninguna fila referencia.
      await this.storage.remove(key).catch(() => undefined);
      if (image.thumb) await this.storage.remove(thumbKey).catch(() => undefined);
      throw error;
    }
  }
}
