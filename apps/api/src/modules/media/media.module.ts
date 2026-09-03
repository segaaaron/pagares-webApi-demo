import { Global, Module } from '@nestjs/common';
import { IMAGE_COMPRESSOR } from './domain/ports/image-compressor.js';
import { OBJECT_STORAGE } from './domain/ports/object-storage.js';
import { S3ObjectStorage } from './infrastructure/s3-object-storage.js';
import { SharpCompressor } from './infrastructure/sharp-compressor.js';
import { PresignUploadUseCase } from './application/presign-upload.use-case.js';
import { UploadsController } from './uploads.controller.js';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
    { provide: IMAGE_COMPRESSOR, useClass: SharpCompressor },
    PresignUploadUseCase,
  ],
  exports: [OBJECT_STORAGE, IMAGE_COMPRESSOR],
})
export class MediaModule {}
