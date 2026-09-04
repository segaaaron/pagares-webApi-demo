import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accesibilidad automática de las rutas críticas (§25.9, nivel UI).
 *
 * axe no dice si la pantalla se entiende; dice si hay contraste insuficiente,
 * un campo sin etiqueta o una tabla sin cabecera. Eso es exactamente lo que se
 * cuela al mover clases de Tailwind, y es lo que ninguna revisión a ojo pilla
 * dos veces seguidas.
 *
 * Requiere `pnpm dev` (web y API) y la base sembrada.
 */
const ADMIN = { email: 'admin@pagares.local', password: 'Demo-Pagares-2026' };
const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';

/** Las reglas que se exigen: WCAG 2.1 AA, que es el compromiso de §19.9. */
const NORMAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function auditar(page: Page, nombre: string): Promise<void> {
  const resultado = await new AxeBuilder({ page }).withTags(NORMAS).analyze();

  const fallos = resultado.violations.map((v) => ({
    regla: v.id,
    impacto: v.impact,
    descripcion: v.help,
    nodos: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));

  expect(fallos, `${nombre}: ${JSON.stringify(fallos, null, 2)}`).toEqual([]);
}

async function entrar(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(ADMIN.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/');
}

test.describe('accesibilidad de las rutas críticas', () => {
  test('acceso', async ({ page }) => {
    await page.goto('/login');
    await auditar(page, '/login');
  });

  test('recuperar contraseña', async ({ page }) => {
    await page.goto('/login/recuperar');
    await auditar(page, '/login/recuperar');
  });

  test('panel de hoy', async ({ page }) => {
    await entrar(page);
    await auditar(page, '/');
  });

  test('cartera: la tabla es la aplicación', async ({ page }) => {
    await entrar(page);
    await page.goto('/pagares');
    await expect(page.getByRole('table')).toBeVisible();
    await auditar(page, '/pagares');
  });

  test('detalle del pagaré', async ({ page }) => {
    await entrar(page);
    await page.goto('/pagares');
    // Los enlaces de la cabecera ordenan la tabla; el del folio es el que abre
    // el pagaré, así que se pide por su forma de URL y no por posición.
    await page.locator('table a[href^="/pagares/"]').first().click();
    await page.waitForURL(/\/pagares\/[0-9a-f-]{36}/);
    await auditar(page, '/pagares/[id]');
  });

  test('emisión: el formulario más largo del panel', async ({ page }) => {
    await entrar(page);
    await page.goto('/pagares/nuevo');
    await auditar(page, '/pagares/nuevo');
  });

  test('cartera por antigüedad', async ({ page }) => {
    await entrar(page);
    await page.goto('/cartera');
    await auditar(page, '/cartera');
  });

  test('cobranza', async ({ page }) => {
    await entrar(page);
    await page.goto('/cobranza');
    await auditar(page, '/cobranza');
  });

  test('reportes', async ({ page }) => {
    await entrar(page);
    await page.goto('/reportes');
    await auditar(page, '/reportes');
  });

  test('vista pública sin sesión', async ({ page, request }) => {
    // La única pantalla que ve alguien de fuera. El token sale de emitir un
    // pagaré por la API: pedirlo por pantalla obligaría a firmar primero.
    const login = await request.post(`${API}/auth/login`, { data: ADMIN });
    const { accessToken } = (await login.json()) as { accessToken: string };

    const hoy = new Date();
    const fecha = (dias: number): string => {
      const d = new Date(hoy);
      d.setUTCDate(d.getUTCDate() + dias);
      return d.toISOString().slice(0, 10);
    };

    const emitido = await request.post(`${API}/admin/notes`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: {
        debtor: {
          fullName: `Accesibilidad ${Date.now()}`,
          address: 'Calle de prueba 1',
          phone: `+52443${String(Date.now()).slice(-7)}`,
        },
        issuePlace: 'Morelia, Michoacán',
        issueDate: fecha(-1),
        paymentPlace: 'Morelia, Michoacán',
        dueDate: fecha(30),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: '1000000',
        interestRate: { value: 2, period: 'MONTHLY' },
      },
    });
    expect(emitido.status()).toBe(201);
    const { publicUrl } = (await emitido.json()) as { publicUrl: string };

    await page.goto(publicUrl);
    await auditar(page, publicUrl);
  });
});
