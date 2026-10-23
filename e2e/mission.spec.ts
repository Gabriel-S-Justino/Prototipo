import { expect, test, type Page } from '@playwright/test';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Etapas da missão' });

test('fluxo completo: hangar → planejamento → checklist → lançamento → cruzeiro → Marte → relatório', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar missão' }).click();
  await expect(nav(page).getByRole('button', { name: 'Hangar' })).toHaveAttribute('aria-current', 'step');
  await page.getByRole('button', { name: 'Seguir para o planejamento' }).click();
  await expect(page.getByLabel('Tempo de voo (dias)')).toHaveValue('293');
  await page.getByRole('button', { name: 'Ir ao checklist de lançamento' }).click();
  await page.getByRole('button', { name: 'Lançar', exact: true }).click();
  await page.getByRole('button', { name: 'Pular para o fim da sequência' }).click();
  await page.getByRole('button', { name: 'Seguir para o cruzeiro' }).click();

  for (let i = 0; i < 80; i++) {
    if (await page.getByRole('button', { name: 'Executar inserção orbital' }).isVisible()) {
      await page.getByRole('button', { name: 'Executar inserção orbital' }).click();
      break;
    }
    const tcm = page.getByRole('button', { name: 'Executar correção' });
    if (await tcm.isVisible()) { await tcm.click(); continue; }
    const solar = page.getByRole('region', { name: 'Decisão: evento solar' });
    if (await solar.isVisible()) { await solar.getByRole('button', { name: /prote/i }).first().click(); continue; }
    await page.getByRole('button', { name: 'Até o próximo evento' }).click();
  }

  await expect(nav(page).getByRole('button', { name: /Marte/ })).toHaveAttribute('aria-current', 'step');
  for (let t = 1; t <= 8; t++) await page.getByRole('button', { name: `Executar turno ${t}` }).click();
  await expect(page.getByRole('button', { name: 'Nova missão' })).toBeVisible();
  await expect(page.getByText(/fictício/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('o proxy /api/horizons responde com erro claro quando os parâmetros são inválidos', async ({ request }) => {
  const r = await request.get('/api/horizons?body=pluto');
  expect(r.status()).toBe(400);
  expect((await r.json()).kind).toBe('parametros');
});

test('perda do contexto WebGL vira aviso e some quando o contexto volta', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar missão' }).click();
  const canvas = page.locator('.view3d canvas').first();
  await expect(canvas).toBeVisible();
  await canvas.evaluate((c: HTMLCanvasElement) => {
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { restoreGl: () => void }).restoreGl = () => ext.restoreContext();
    ext.loseContext();
  });
  await expect(page.getByText(/descartou o contexto WebGL/)).toBeVisible();
  // Quando o navegador devolve o contexto, a cena volta e o aviso some.
  await page.evaluate(() => (window as unknown as { restoreGl: () => void }).restoreGl());
  await expect(page.getByText(/descartou o contexto WebGL/)).toHaveCount(0);
});
