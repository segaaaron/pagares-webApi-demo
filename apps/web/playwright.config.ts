import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de navegador: accesibilidad de las rutas críticas y los flujos que
 * sólo se rompen en el navegador (§25.9, nivel UI).
 *
 * No levanta nada: corre contra la web y la API que ya tengas arriba con
 * `pnpm dev`, igual que las pruebas e2e de la API. Levantarlas aquí duplicaría
 * la forma de arrancar el proyecto, y entonces habría dos.
 */
export default defineConfig({
  testDir: './test',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
