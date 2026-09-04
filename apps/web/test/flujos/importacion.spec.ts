import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Importación de cartera desde el navegador (§24.5).
 *
 * El campo de archivo va oculto —el del navegador sale en inglés y con el
 * aspecto del sistema operativo— y se gobierna desde una etiqueta. Eso es
 * exactamente lo que se rompe en silencio: la pantalla sigue viéndose bien y el
 * archivo deja de llegar. Por eso se prueba el camino entero.
 */
const ADMIN = { email: 'admin@pagares.local', password: 'Demo-Pagares-2026' };

async function entrarAImportar(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(ADMIN.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/');
  await page.goto('/clientes');
  await page.getByText('Importar cartera desde un archivo').click();
}

test('la plantilla trae la cabecera y una fila de ejemplo', async ({ page }) => {
  // Un archivo con sólo cabeceras no enseña el formato de la fecha ni el del
  // importe, que es lo que se teclea mal.
  await entrarAImportar(page);

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Descargar plantilla' }).first().click(),
  ]);

  expect(descarga.suggestedFilename()).toBe('plantilla-deudores.csv');
  const contenido = readFileSync(await descarga.path(), 'utf8');

  expect(contenido).toContain('nombre;domicilio;telefono;correo;notas');
  expect(contenido).toContain('Juana Ejemplo');
  // Con BOM, o Excel en español lee los acentos como basura.
  expect(contenido.startsWith('﻿')).toBe(true);
});

test('elegir un archivo, revisarlo y ver cuántas filas entrarían', async ({ page }) => {
  await entrarAImportar(page);

  const csv =
    'nombre;domicilio;telefono;correo\n' +
    `Deudor de prueba ${Date.now()};Calle 9;+5244399${String(Date.now()).slice(-5)};prueba@ejemplo.mx\n`;
  const ruta = join(tmpdir(), `deudores-${Date.now()}.csv`);
  writeFileSync(ruta, `﻿${csv}`);

  await page.locator('#archivo-debtors').setInputFiles(ruta);

  // El nombre del archivo elegido tiene que verse: es la única confirmación de
  // que el campo oculto recibió algo.
  await expect(page.getByText(ruta.split('/').pop() ?? '')).toBeVisible();

  await page.getByRole('button', { name: 'Revisar archivo' }).first().click();

  // Revisar no escribe: enseña qué entraría y espera la segunda pulsación.
  await expect(page.getByRole('button', { name: /Importar \d+ fila/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Nada se ha escrito todavía.')).toBeVisible();
});
