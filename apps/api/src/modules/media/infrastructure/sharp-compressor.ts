import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { IMAGE_PROFILES, type ImageProfile, type ImageProfileName } from '../domain/image-profile.js';
import { EmptyImageError, FileTooLargeError, UnsupportedFormatError } from '../domain/media.errors.js';
import type { CompressedImage, ImageCompressor } from '../domain/ports/image-compressor.js';

// Acota la memoria del proceso: sin esto, sharp mantiene una caché propia y
// varias subidas seguidas la hacen crecer sin control.
sharp.cache(false);
sharp.concurrency(1);

const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Compresión de imágenes (§8.4). **El orden de los pasos es la defensa**, no una
 * preferencia: cada uno cierra un ataque distinto antes de gastar recursos.
 */
@Injectable()
export class SharpCompressor implements ImageCompressor {
  async compress(input: Buffer, profileName: ImageProfileName): Promise<CompressedImage> {
    const profile: ImageProfile = IMAGE_PROFILES[profileName];

    // 1. Tamaño, antes de decodificar nada.
    if (input.byteLength > profile.maxBytes) throw new FileTooLargeError(profile.maxBytes);

    // 2. `limitInputPixels` corta la bomba de descompresión: 100 megapíxeles
    //    empaquetados en 50 KB reventarían la memoria al decodificar.
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await image.metadata();

    // 3. El formato se decide por los bytes reales, nunca por lo que dice el cliente.
    if (!meta.format || !(profile.accepted as readonly string[]).includes(meta.format)) {
      throw new UnsupportedFormatError(meta.format ?? 'desconocido');
    }

    // 4. Lienzo vacío: la media del canal alfa delata una firma en blanco.
    if (profile.minInkRatio !== undefined) {
      const stats = await image.clone().stats();
      const alpha = stats.channels[stats.channels.length - 1];
      if (meta.hasAlpha && alpha && alpha.mean / 255 < profile.minInkRatio) {
        throw new EmptyImageError();
      }
    }

    // 5. `rotate()` aplica la orientación EXIF y descarta el resto de metadatos:
    //    la ubicación GPS de una foto es dato personal y no tiene por qué viajar.
    const full = await image
      .clone()
      .rotate()
      .trim({ threshold: 8 })
      .resize({
        width: profile.maxWidth,
        height: profile.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: profile.quality, alphaQuality: 100, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const thumb = profile.thumbWidth
      ? await sharp(full.data)
          .resize({ width: profile.thumbWidth, withoutEnlargement: true })
          .webp({ quality: 70 })
          .toBuffer()
      : null;

    return {
      full: full.data,
      thumb,
      width: full.info.width,
      height: full.info.height,
      byteSize: full.info.size,
      // 6. El hash permite probar después que lo almacenado es lo que se comprimió.
      sha256: createHash('sha256').update(full.data).digest('hex'),
    };
  }
}
