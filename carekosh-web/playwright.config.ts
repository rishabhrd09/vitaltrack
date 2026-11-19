import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5188",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:demo -- --port 5188 --strictPort",
      url: "http://127.0.0.1:5188",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev:api -- --port 5190 --strictPort",
      url: "http://127.0.0.1:5190",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: ["**/api-item-editor.spec.ts", "**/*.api.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "chromium-api-mocked",
      testMatch: ["**/api-item-editor.spec.ts", "**/*.api.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5190",
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
