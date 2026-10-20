import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // 1 = fully serial, guaranteed reliable on a modest local machine running
  // a single Node API process + single MySQL instance (this project's
  // default setup). We confirmed (production build + retries + trace
  // evidence) that specific tests fail consistently at 4 workers — not
  // randomly — because several concurrent signups/bookings contend for the
  // same single-threaded Node event loop and a shared MySQL connection
  // pool. This isn't an app bug; it's the real capacity of this local
  // stack. Raise this once you deploy against a properly resourced
  // CI runner or a beefier local setup, and confirm it stays green there.
  workers: 1,
  // A safety net on top of the root-cause fix below — real, reproducible
  // bugs will still fail every retry and show up in the report.
  retries: 2,
  reporter: [
    ["html", { open: "never" }],
    ["allure-playwright", { resultsDir: "allure-results" }],
    ["list"],
  ],
  expect: {
    // Raised from 10s after observing this specific machine run the full
    // suite in anywhere from 1.5 to 8 minutes across different attempts —
    // real variance in system load (antivirus scans, background processes)
    // means a tight timeout sometimes fails things that would have passed
    // with a few more seconds.
    timeout: 20_000,
  },
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Serves the PRODUCTION BUILD (vite preview) instead of the dev server.
    // Vite's dev server compiles each module on first request, which caused
    // real, reproducible timeouts on the first 1-2 tests per file after a
    // fresh start (confirmed via manual debug script — the app itself has
    // no bug here). The `pretest:e2e` npm hook runs `vite build` first, so
    // everything is pre-compiled before Playwright ever loads a page.
    // Requires MySQL already running and server/.env configured — run
    // `npm run db:init --prefix server` once beforehand to create/seed the schema.
    command: "npm run serve:full",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
});
