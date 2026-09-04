import { test, expect, type Page } from '@playwright/test';

/**
 * Flujos que sólo se rompen en el navegador (§25.9, nivel UI).
 *
 * Existen por un defecto concreto: los botones de reenviar y de mandar los
 * recordatorios funcionaban en el servidor pero no decían nada al terminar,
 * porque el estado de la acción no traía el campo que dispara el aviso. Desde
 * fuera, pulsar el botón parecía no hacer nada — y la reacción natural es
 * pulsarlo otra vez.
 */
const ADMIN = { email: 'admin@pagares.local', password: 'Demo-Pagares-2026' };
const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';

async function entrar(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(ADMIN.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/');
}

test.describe('avisos que no salieron', () => {
  test('la pantalla dice si hay algo atascado o si está todo entregado', async ({ page }) => {
    await entrar(page);
    await page.goto('/avisos');

    // Una tabla vacía sin explicación es un defecto (§19.3): o hay filas, o hay
    // un texto que dice por qué no las hay.
    const vacio = page.getByText('Todo lo que se generó, salió');
    const tabla = page.getByRole('table');
    await expect(vacio.or(tabla).first()).toBeVisible();
  });

  test('el menú lleva a los avisos', async ({ page }) => {
    await entrar(page);
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Avisos' }).click();
    await page.waitForURL('**/avisos');
    await expect(page.getByRole('heading', { name: 'Avisos', level: 1 })).toBeVisible();
  });
});

test.describe('recordatorios del día', () => {
  test('el botón dice cuántos son y confirma al terminar', async ({ page, request }) => {
    /*
     * El candidato se fabrica aquí en vez de confiar en la semilla: si el día
     * que se corre la suite no vence nada, la prueba pasaría sin ejercitar el
     * botón, que es justo lo que hay que cubrir. La regla sembrada con
     * `offsetDays: 0` es la que hace que un pagaré que vence hoy toque aviso.
     */
    const login = await request.post(`${API}/auth/login`, { data: ADMIN });
    const { accessToken } = (await login.json()) as { accessToken: string };

    const hoy = new Date();
    const fecha = (dias: number): string => {
      const d = new Date(hoy);
      d.setUTCDate(d.getUTCDate() + dias);
      return d.toISOString().slice(0, 10);
    };
    const sufijo = `${Date.now()}`;
    const telefono = `+52443${sufijo.slice(-7)}`;

    const emitido = await request.post(`${API}/admin/notes`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        debtor: {
          fullName: `Recordatorio ${sufijo}`,
          address: 'Calle de prueba 1',
          phone: telefono,
          email: `recordatorio-${sufijo}@ejemplo.mx`,
        },
        issuePlace: 'Morelia, Michoacán',
        issueDate: fecha(-30),
        paymentPlace: 'Morelia, Michoacán',
        // Vence hoy: la regla de `offsetDays: 0` de la semilla.
        dueDate: fecha(0),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '500000',
        interestRate: { value: 2, period: 'MONTHLY' },
      },
    });
    expect(emitido.status()).toBe(201);

    /*
     * El pagaré nace por firmar y así no admite recordatorio; se importa uno
     * firmado en papel para el mismo deudor, que es la vía corta (§24.5). El
     * importe tiene que ser distinto del emitido: mismo deudor, mismo importe y
     * mismo vencimiento es la firma de «este archivo ya se importó», y la
     * importación lo descarta por duplicado.
     */
    const csv = [
      'telefono_deudor,importe,fecha_emision,vencimiento,abonado',
      `${telefono},7350.00,${fecha(-30)},${fecha(0)},0`,
    ].join('\n');
    const importado = await request.post(`${API}/admin/imports/notes`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': crypto.randomUUID() },
      data: { csv, commit: true },
    });
    expect(importado.status()).toBe(200);

    await entrar(page);

    const tarjeta = page.getByRole('region', { name: 'Recordatorios de hoy' });
    await expect(tarjeta).toBeVisible();
    // La lista va antes que el botón: nadie manda correos a ciegas.
    await expect(tarjeta.getByRole('listitem').first()).toBeVisible();

    await page.getByRole('button', { name: /Enviar (el|los) .*recordatorio/ }).click();

    /*
     * Ésta es la regresión que cubre la prueba: al terminar tiene que aparecer
     * el aviso, y con texto. Sin él, el administrador no sabe si salieron los
     * correos, y la reacción natural es volver a pulsar.
     *
     * Se busca el texto y no sólo el rol: el esqueleto de carga también es un
     * `role="status"`, y afirmar sobre el rol pelado pasaría sin que hubiera
     * ningún aviso.
     */
    const aviso = page
      .getByText(/Salió el recordatorio|Salieron los \d+ recordatorios|ya habían salido|no salieron/)
      .last();
    await expect(aviso).toBeVisible({ timeout: 15_000 });
  });
});
