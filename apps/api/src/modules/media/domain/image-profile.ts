/**
 * Perfiles de imagen declarativos (§8.3). Añadir un tipo de archivo es añadir
 * una entrada aquí, no escribir código nuevo.
 */
export interface ImageProfile {
  readonly name: string;
  readonly maxBytes: number;
  readonly accepted: readonly string[];
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly quality: number;
  readonly thumbWidth?: number;
  /** Proporción mínima de tinta: por debajo, el lienzo se considera vacío. */
  readonly minInkRatio?: number;
}

export const IMAGE_PROFILES = {
  signature: {
    name: 'signature',
    maxBytes: 5 * 1024 * 1024,
    accepted: ['png', 'jpeg'],
    maxWidth: 1200,
    maxHeight: 400,
    quality: 82,
    thumbWidth: 240,
    minInkRatio: 0.002,
  },
  /**
   * Escaneos del expediente judicial (§8.3). Tolera más peso y más resolución
   * que un anexo cualquiera: lo que se lleva al juzgado tiene que ser legible.
   */
  'legal-exhibit': {
    name: 'legal-exhibit',
    maxBytes: 20 * 1024 * 1024,
    accepted: ['png', 'jpeg', 'heif', 'pdf'],
    maxWidth: 3000,
    maxHeight: 3000,
    quality: 85,
  },
  'document-scan': {
    name: 'document-scan',
    maxBytes: 10 * 1024 * 1024,
    accepted: ['png', 'jpeg', 'heif'],
    maxWidth: 2000,
    maxHeight: 2000,
    quality: 78,
  },
} satisfies Record<string, ImageProfile>;

export type ImageProfileName = keyof typeof IMAGE_PROFILES;
