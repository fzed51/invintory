import { defineConfig, devices } from '@playwright/test';

// Deux cibles :
// - « socle » : la doublure Docker (« npm run build » puis « docker compose up -d ») ;
// - « catalogue » : la page /catalogue du serveur de développement Vite, lancé au besoin.
const DEV_URL = 'http://localhost:5173';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'socle',
      testIgnore: 'catalogue.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080' },
    },
    {
      name: 'catalogue',
      testMatch: 'catalogue.spec.ts',
      // Application mobile : écran de téléphone, rendu Chromium.
      use: { ...devices['Pixel 7'], baseURL: DEV_URL },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: DEV_URL,
    reuseExistingServer: true,
  },
});
