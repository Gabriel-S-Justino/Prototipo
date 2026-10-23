import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Em ambientes com Chromium pré-instalado (PLAYWRIGHT_BROWSERS_PATH), usa-o; senão, o navegador baixado pelo Playwright.
const preinstalled = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    launchOptions: existsSync(preinstalled) && !process.env.PW_USE_BUNDLED ? { executablePath: preinstalled } : {},
  },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 180_000 },
});
