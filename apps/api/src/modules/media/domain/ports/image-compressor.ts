import type { ImageProfileName } from '../image-profile.js';

export interface CompressedImage {
  full: Buffer;
  thumb: Buffer | null;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
}

/** Puerto de compresión (§8.4). Otros módulos dependen de esto, no de sharp. */
export interface ImageCompressor {
  compress(input: Buffer, profile: ImageProfileName): Promise<CompressedImage>;
}

export const IMAGE_COMPRESSOR = Symbol('ImageCompressor');
