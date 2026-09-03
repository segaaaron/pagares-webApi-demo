import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Spectral } from 'next/font/google';
import './globals.css';

/*
 * Las tres familias del sistema (§19.9), servidas por Next desde el propio
 * dominio: sin llamada a Google en tiempo de ejecución y sin salto al cargar.
 *
 * Plex Sans para la interfaz, Spectral para los títulos —da el aire de
 * documento que un pagaré tiene— y Plex Mono para folios y sellos, que se leen
 * carácter a carácter.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const spectral = Spectral({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-spectral',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pagarés',
  description: 'Control de pagarés, cartera y cobranza',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${plexSans.variable} ${spectral.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
