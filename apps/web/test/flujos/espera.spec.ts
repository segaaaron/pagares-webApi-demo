import { test, expect } from '@playwright/test';

/**
 * El velo de espera (§19.3).
 *
 * Existe por un fallo real: al registrar un abono, el botón se quedó en
 * «Registrando…» y no había forma de saber si el dinero había entrado. El velo
 * cubre la pantalla mientras la acción viaja, y de paso impide el segundo clic
 * —un abono es dinero, y registrarlo dos veces se arregla mal.
 */
const ADMIN = { email: 'admin@pagares.local', password: 'Demo-Pagares-2026' };

test('al guardar, la pantalla se cubre y no admite un segundo clic', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(ADMIN.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/');

  await page.goto('/pagares?tab=vigentes');
  await page.locator('table a[href^="/pagares/"]').first().click();
  await page.waitForURL(/\/pagares\/[0-9a-f-]{36}/);
  await page.waitForLoadState('networkidle');

  /*
   * La acción se retrasa a propósito. Sin esto la prueba depende de que el
   * servidor tarde lo suficiente en contestar, que es justo la clase de prueba
   * que pasa en una máquina y falla en otra.
   */
  await page.route('**/pagares/**', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((listo) => setTimeout(listo, 2000));
    }
    await route.continue();
  });

  await page.getByLabel('Importe (pesos)').fill('100');
  await page.getByRole('button', { name: 'Registrar abono' }).click();

  const velo = page.getByRole('status').filter({ hasText: 'Guardando' });
  await expect(velo).toBeVisible();

  /*
   * Cubre de verdad. Dos garantías distintas y las dos importan: el propio
   * botón se deshabilita —su nombre pasa a «Registrando…»— y, aunque no lo
   * hiciera, el velo se lleva el clic por delante.
   */
  const boton = page.getByRole('button', { name: /Registrar abono|Registrando/ });
  await expect(boton).toBeDisabled();
  await expect(boton.click({ timeout: 1500 })).rejects.toThrow();

  // Y se quita solo al terminar, sin dejar la pantalla bloqueada.
  await expect(velo).toBeHidden({ timeout: 25_000 });
});
