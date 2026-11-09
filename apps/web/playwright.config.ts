import { defineConfig } from "@playwright/test";

// CI installs Chromium. Locally, PLAYWRIGHT_CHANNEL can name an installed browser.
const browser = process.env.PLAYWRIGHT_CHANNEL
  ? { channel: process.env.PLAYWRIGHT_CHANNEL }
  : { browserName: "chromium" as const };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "pnpm exec serve out -l 4173 --no-clipboard",
    url: "http://localhost:4173",
    reuseExistingServer: false,
  },
  projects: [
    { name: "laptop", use: { ...browser, viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...browser, viewport: { width: 768, height: 1024 } } },
    {
      name: "phone",
      use: { ...browser, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
});
