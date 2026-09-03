import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { BaseUseCase, CLOCK, type Clock, type ExecutionContext } from '@pagares/api-core';
import { businessToday } from '@pagares/domain-rules';
import { PrismaService } from '../../../shared/persistence/prisma.service.js';
import { NestUseCaseLogger } from '../../../shared/application/nest-use-case-logger.js';
import { IMAGE_PROFILES, type ImageProfileName } from '../domain/image-profile.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../domain/ports/object-storage.js';

export type PresignUploadInput =
  | { mode: 'presign'; profile: ImageProfileName; contentType: string }
  | { mode: 'confirm'; key: string };

export type PresignUploadOutput =
  | { mode: 'presign'; url: string; key: string; expiresIn: number; maxBytes: number }
  | { mode: 'confirm'; assetId: string; byteSize: number; sha256: string };

/** Los perfiles que se suben por URL prefirmada, y por tanto los confirmables. */
const CONFIRMABLE_PROFILES = ['legal-exhibit', 'document-scan'] as const;
type ConfirmableProfile = (typeof CONFIRMABLE_PROFILES)[number];

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

/** La vuelta del mapa: de la extensión de la clave al tipo que se guarda. */
const CONTENT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([contentType, extension]) => [extension, contentType]),
);

/**
 * Subida directa al almacenamiento (§8.5).
 *
 * Dos pasos por el mismo endpoint: se pide la URL y luego se confirma con la
 * clave. La confirmación no es un trámite —es donde se calcula el `sha256` y el
 * tamaño reales del objeto subido. Fiarse de lo que declare el cliente dejaría
 * un expediente cuya huella la eligió quien subió el archivo.
 *
 * La firma sigue yendo por multipart: 480 KB no justifican dos viajes (§8.5).
 */
@Injectable()
export class PresignUploadUseCase extends BaseUseCase<PresignUploadInput, PresignUploadOutput> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    super(new NestUseCaseLogger(PresignUploadUseCase.name));
  }

  protected async handle(
    input: PresignUploadInput,
    _ctx: ExecutionContext,
  ): Promise<PresignUploadOutput> {
    if (input.mode === 'presign') {
      const profile = IMAGE_PROFILES[input.profile];
      const extension = EXTENSIONS[input.contentType];
      if (!extension || !profile.accepted.includes(extension === 'jpg' ? 'jpeg' : extension)) {
        throw new BadRequestException(
          `El perfil ${profile.name} no acepta ${input.contentType}`,
        );
      }

      // La clave la fija el servidor: si la eligiera el cliente podría escribir
      // encima de la firma de otro pagaré (§9.1, API1).
      const key = `${profile.name}/${businessToday(this.clock.now())}/${randomUUID()}.${extension}`;
      const presigned = await this.storage.presignPut({
        key,
        contentType: input.contentType,
        maxBytes: profile.maxBytes,
      });

      return { mode: 'presign', ...presigned, maxBytes: profile.maxBytes };
    }

    /*
     * La confirmación sólo acepta claves de los perfiles que este endpoint
     * genera. Sin esto, alguien podría confirmar la clave de una firma ajena y
     * darse de alta un `MediaAsset` que apunta a la evidencia de otro (§9.1).
     */
    const profileName = input.key.split('/')[0] ?? '';
    if (!CONFIRMABLE_PROFILES.includes(profileName as ConfirmableProfile)) {
      throw new BadRequestException('Esa clave no corresponde a una subida directa');
    }

    const existing = await this.prisma.mediaAsset.findUnique({
      where: { storageKey: input.key },
    });
    // Confirmar dos veces la misma clave devuelve el mismo asset: reintentar una
    // subida cortada no puede duplicar el anexo (§12.4).
    if (existing) {
      return {
        mode: 'confirm',
        assetId: existing.id,
        byteSize: existing.byteSize,
        sha256: existing.sha256,
      };
    }

    const body = await this.storage.get(input.key).catch(() => null);
    if (!body) throw new NotFoundException('No hay ningún objeto con esa clave');

    const profile = IMAGE_PROFILES[profileName as ImageProfileName];
    if (body.byteLength > profile.maxBytes) {
      // Se subió más de lo autorizado: el objeto se borra en lugar de quedar
      // huérfano ocupando el bucket.
      await this.storage.remove(input.key);
      throw new BadRequestException('El archivo excede el tamaño permitido para su perfil');
    }

    const asset = await this.prisma.mediaAsset.create({
      data: {
        profile: profile.name,
        storageKey: input.key,
        contentType: CONTENT_TYPES[input.key.split('.').pop() ?? ''] ?? 'application/octet-stream',
        byteSize: body.byteLength,
        sha256: createHash('sha256').update(body).digest('hex'),
      },
    });

    return { mode: 'confirm', assetId: asset.id, byteSize: asset.byteSize, sha256: asset.sha256 };
  }
}
