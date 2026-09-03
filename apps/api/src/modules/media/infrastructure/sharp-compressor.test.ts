import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { SharpCompressor } from './sharp-compressor.js';
import { EmptyImageError, FileTooLargeError, UnsupportedFormatError } from '../domain/media.errors.js';

const compressor = new SharpCompressor();

/**
 * Firma sintética con varios trazos, opacidad variable y un desenfoque leve,
 * para que el PNG tenga antialias como el que exporta PencilKit. Un SVG plano
 * comprime demasiado bien en PNG y daría una medición engañosa.
 */
async function drawSignature(width = 1600, height = 600): Promise<Buffer> {
  const strokes = Array.from(
    { length: 6 },
    (_, i) =>
      `<path d="M${60 + i * 10},${420 - i * 12} C${340 + i * 8},${90 + i * 20} 540,${520 - i * 15} ${820 + i * 6},260
         S1240,${140 + i * 18} ${1520 - i * 9},400" stroke="rgba(16,16,20,${0.85 - i * 0.08})"
         stroke-width="${11 - i}" fill="none" stroke-linecap="round"/>`,
  ).join('');
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${strokes}</svg>`;
  return sharp(Buffer.from(svg)).blur(0.4).png().toBuffer();
}

async function blankCanvas(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
}

describe('compresión de la firma', () => {
  it('reduce el peso de forma sustancial', async () => {
    const original = await drawSignature();
    const result = await compressor.compress(original, 'signature');
    // Medido sobre esta muestra: ~50 % de reducción. Se exige 40 % para no
    // atar la prueba a un valor exacto que depende de la imagen.
    expect(result.byteSize).toBeLessThan(original.byteLength * 0.6);
  });

  it('conserva el canal alfa para poder superponer la firma', async () => {
    const result = await compressor.compress(await drawSignature(), 'signature');
    const meta = await sharp(result.full).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.hasAlpha).toBe(true);
  });

  it('reduce el lienzo al área dibujada y al máximo del perfil', async () => {
    // Una firma pequeña en un lienzo grande no debe producir una imagen casi vacía.
    const result = await compressor.compress(await drawSignature(), 'signature');
    expect(result.width).toBeLessThanOrEqual(1200);
    expect(result.height).toBeLessThanOrEqual(400);
  });

  it('genera la miniatura que usa la tabla del dashboard', async () => {
    const result = await compressor.compress(await drawSignature(), 'signature');
    expect(result.thumb).not.toBeNull();
    const meta = await sharp(result.thumb!).metadata();
    expect(meta.width).toBeLessThanOrEqual(240);
  });

  it('rechaza un lienzo en blanco', async () => {
    await expect(compressor.compress(await blankCanvas(), 'signature')).rejects.toThrow(EmptyImageError);
  });

  it('rechaza un archivo que supera el límite', async () => {
    const huge = Buffer.alloc(6 * 1024 * 1024, 1);
    await expect(compressor.compress(huge, 'signature')).rejects.toThrow(FileTooLargeError);
  });

  it('rechaza un formato no admitido leyendo los bytes reales', async () => {
    // Un GIF renombrado a .png no engaña: el formato se detecta del contenido.
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#fff' },
    })
      .gif()
      .toBuffer();
    await expect(compressor.compress(gif, 'signature')).rejects.toThrow(UnsupportedFormatError);
  });

  it('produce el mismo hash para el mismo resultado', async () => {
    const original = await drawSignature();
    const a = await compressor.compress(original, 'signature');
    const b = await compressor.compress(original, 'signature');
    expect(a.sha256).toBe(b.sha256);
  });
});
