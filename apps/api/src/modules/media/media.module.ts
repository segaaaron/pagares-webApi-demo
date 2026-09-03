import { Global, Module } from '@nestjs/common';
import { IMAGE_COMPRESSOR } from './domain/ports/image-compressor.js';
import { OBJECT_STORAGE } from './domain/ports/object-storage.js';
import { S3ObjectStorage } from './infrastructure/s3-object-storage.js';
import { LocalObjectStorage } from './infrastructure/local-object-storage.js';
import { SharpCompressor } from './infrastructure/sharp-compressor.js';
import { PresignUploadUseCase } from './application/presign-upload.use-case.js';
import { UploadsController } from './uploads.controller.js';
import { FilesController } from './files.controller.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { CLOCK, type Clock } from '@pagares/api-core';

@Global()
@Module({
  controllers: [UploadsController, FilesController],
  providers: [
    /*
     * Un puerto, dos adaptadores, y la decisión en una variable de entorno (§8):
     * `local` guarda en el volumen del servidor y `s3` en un bucket. Ningún caso
     * de uso sabe cuál está detrás.
     */
    {
      provide: OBJECT_STORAGE,
      inject: [ENV, CLOCK],
      useFactory: (env: Env, clock: Clock) =>
        env.STORAGE_DRIVER === 's3' ? new S3ObjectStorage(env) : new LocalObjectStorage(env, clock),
    },
    { provide: IMAGE_COMPRESSOR, useClass: SharpCompressor },
    PresignUploadUseCase,
  ],
  exports: [OBJECT_STORAGE, IMAGE_COMPRESSOR],
})
export class MediaModule {}
