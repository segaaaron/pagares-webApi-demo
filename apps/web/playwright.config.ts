import { defineConfig, devices } from '@playwright/test';

/**
 * Accesibilidad automática de las rutas críticas (§25.9, nivel UI).
 *
 * No levanta nada: corre contra la web y la API que ya tengas arriba con
 * `pnpm dev`, igual que las pruebas e2e de la API. Levantarlas aquí duplicaría
 * la forma de arrancar el proyecto, y entonces habría dos.
 */
export default defineConfig({
  testDir: './test/a11y',
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
