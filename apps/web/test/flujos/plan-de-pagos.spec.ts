import { test, expect, type Page } from '@playwright/test';

/**
 * El plan de pagos en el formulario de emisión (§12).
 *
 * Lo que se pacta con el deudor delante son tres cifras —cuánto paga al mes,
 * cuánto acaba pagando y cuánto gana quien presta— y esta pantalla es donde se
 * acuerdan. La tabla se calcula con la misma función que usará el servidor al
 * emitir, así que estas pruebas comprueban que lo que se enseña es lo que se
 * firma, y no una aproximación de la pantalla.
 */
const ADMIN = { email: 'admin@pagares.local', password: 'Demo-Pagares-2026' };

async function abrirEmision(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(ADMIN.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/');
  await page.goto('/pagares/nuevo');
  await page.waitForLoadState('networkidle');
}

test('sin plazos no hay plan: un pagaré suelto no necesita tabla', async ({ page }) => {
  // Enseñar cinco campos de amortización a quien emite un pagaré suelto es
  // ruido; la sección aparece sólo cuando hay cuotas.
  await abrirEmision(page);
  await page.getByLabel('Importe (pesos)').fill('60000');

  await expect(page.getByRole('region', { name: 'Plan de pagos' })).toHaveCount(0);
  await expect(page.getByLabel('Interés del préstamo', { exact: true })).toHaveCount(0);
});

test('con interés sobre saldos insolutos, la tabla dice lo que se va a firmar', async ({ page }) => {
  await abrirEmision(page);
  await page.getByLabel('Importe (pesos)').fill('60000');
  await page.getByLabel('Número de pagos').selectOption('12');
  await page.getByLabel('Interés del préstamo', { exact: true }).selectOption('INSOLUTOS');
  await page.getByLabel('Tasa del préstamo').fill('3');

  const plan = page.getByRole('region', { name: 'Plan de pagos' });
  await expect(plan).toBeVisible();

  /*
   * $60,000 a 3 % mensual en doce cuotas: $6,027.73 al mes, $12,332.69 de
   * ganancia. Las cifras van escritas a propósito: si el reparto cambia sin
   * querer, esta prueba lo dice en vez de aprobar cualquier número.
   */
  await expect(plan).toContainText('$6,027.73');
  await expect(plan).toContainText('$12,332.69');
  await expect(plan).toContainText('$72,332.69');

  // Doce cuotas, ni once ni trece.
  await expect(plan.locator('tbody tr')).toHaveCount(12);

  // Y el saldo de la última llega a cero: el plan liquida la deuda.
  await expect(plan.locator('tbody tr').last()).toContainText('$0.00');
});

test('el saldo global avisa de que sale más caro, y no sólo con color', async ({ page }) => {
  await abrirEmision(page);
  await page.getByLabel('Importe (pesos)').fill('60000');
  await page.getByLabel('Número de pagos').selectOption('12');
  await page.getByLabel('Interés del préstamo', { exact: true }).selectOption('GLOBAL');
  await page.getByLabel('Tasa del préstamo').fill('3');

  const plan = page.getByRole('region', { name: 'Plan de pagos' });
  // 60,000 × 3 % × 12 = 21,600, calculado siempre sobre el importe original.
  await expect(plan).toContainText('$21,600.00');
  // El aviso va con texto, no fiado al color de fondo.
  await expect(plan).toContainText('saldo global');
  await expect(plan).toContainText('Banxico');
});

test('sin interés, el plan reparte sólo el préstamo', async ({ page }) => {
  await abrirEmision(page);
  await page.getByLabel('Importe (pesos)').fill('60000');
  await page.getByLabel('Número de pagos').selectOption('12');

  const plan = page.getByRole('region', { name: 'Plan de pagos' });
  await expect(plan).toBeVisible();
  // Doce de $5,000 y nada de ganancia: es un calendario, no un crédito.
  await expect(plan).toContainText('$5,000.00');
  await expect(plan).toContainText('$0.00');
});

/**
 * Liquidación anticipada (§12): la pregunta que hace el deudor por teléfono.
 *
 * La respuesta no es la misma según cómo se pactó el interés, y ése es el punto:
 * sobre saldos insolutos el interés que no transcurre no se cobra; sobre saldo
 * global se pactó de una vez y adelantar no lo baja. La cifra la calcula el
 * servidor —aquí sólo se comprueba que la pantalla dice la verdad—.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';

/** Emite una serie por la API y devuelve el primer pagaré. */
async function emitirSerie(
  request: import('@playwright/test').APIRequestContext,
  model: 'INSOLUTOS' | 'GLOBAL',
): Promise<string> {
  const login = await request.post(`${API}/auth/login`, { data: ADMIN });
  const { accessToken } = (await login.json()) as { accessToken: string };

  const hoy = new Date();
  const ayer = new Date(hoy.getTime() - 86_400_000).toISOString().slice(0, 10);
  const vence = new Date(hoy.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);

  const respuesta = await request.post(`${API}/admin/notes`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: {
      debtor: {
        fullName: `Liquidación ${Date.now()}`,
        address: 'Calle de prueba 1',
        phone: `+52443${String(Date.now()).slice(-7)}`,
      },
      issuePlace: 'Morelia, Michoacán',
      issueDate: ayer,
      paymentPlace: 'Morelia, Michoacán',
      dueDate: vence,
      creditorName: 'Créditos Morelia S.A. de C.V.',
      amountCents: '6000000',
      interestRate: { value: 3, period: 'MONTHLY' },
      installments: 12,
      plan: { model, rate: { value: 3, period: 'MONTHLY' } },
    },
  });

  const { id } = (await respuesta.json()) as { id: string };
  return id;
}

test('sobre saldos insolutos, liquidar antes enseña lo que se ahorra', async ({ page, request }) => {
  const noteId = await emitirSerie(request, 'INSOLUTOS');
  await abrirEmision(page); // deja la sesión abierta en el navegador
  await page.goto(`/pagares/${noteId}`);
  await page.waitForLoadState('networkidle');

  const panel = page.getByRole('region', { name: 'Liquidación anticipada' });
  await panel.getByRole('button', { name: 'Calcular' }).click();

  // Nadie ha abonado ni ha vencido nada: liquidar hoy es devolver lo prestado.
  await expect(panel).toContainText('$60,000.00');
  await expect(panel).toContainText('$12,332.69');
  await expect(panel).toContainText('saldos insolutos');
});

test('sobre saldo global, la pantalla dice que adelantar no ahorra', async ({ page, request }) => {
  // Lo contrario de un descuento silencioso: se pactó así y se dice.
  const noteId = await emitirSerie(request, 'GLOBAL');
  await abrirEmision(page);
  await page.goto(`/pagares/${noteId}`);
  await page.waitForLoadState('networkidle');

  const panel = page.getByRole('region', { name: 'Liquidación anticipada' });
  await panel.getByRole('button', { name: 'Calcular' }).click();

  await expect(panel).toContainText('$81,600.00');
  await expect(panel).toContainText('no lo reduce');
  await expect(panel).not.toContainText('Interés que se ahorra');
});
