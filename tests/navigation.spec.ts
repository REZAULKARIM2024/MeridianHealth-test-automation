import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { NavPage } from "../pages/NavPage";
import { uniqueEmail } from "./utils";

test.describe("Navigation & Cross-Device", () => {
  test.beforeEach(async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signup("Nav Tester", uniqueEmail("nav"), "SecurePass1");
  });

  test("NAV-01 each nav tab routes to its own screen", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.book.click();
    await expect(page.getByRole("heading", { name: "Book a doctor" })).toBeVisible();
    await nav.pharmacy.click();
    await expect(page.getByRole("heading", { name: "Pharmacy" })).toBeVisible();
    await nav.trials.click();
    await expect(page.getByRole("heading", { name: "Clinical trials" })).toBeVisible();
    await nav.profile.click();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test("NAV-02 back arrow returns to the previous screen", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.book.click();
    await page.getByTestId("doctor-d1").click();
    await page.getByRole("button", { name: "Go back" }).click();
    await expect(page.getByText("Book a doctor")).toBeVisible();
  });

  test("XDV-01 mobile toggle renders bottom tab bar", async ({ page }) => {
    const nav = new NavPage(page);
    await nav.toggleMobile.click();
    await expect(nav.home).toBeVisible();
    const box = await nav.appFrame.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(400);
  });

  test("XDV-02 desktop toggle renders side navigation", async ({ page }, testInfo) => {
    // The desktop layout is wider than 800px; a phone viewport (~400px) cannot show it, so this
    // check only makes sense on the desktop projects.
    test.skip(testInfo.project.name.startsWith("mobile"), "desktop layout is wider than a phone viewport");
    const nav = new NavPage(page);
    await nav.toggleDesktop.click();
    await expect(page.getByText("Meridian")).toBeVisible();
    const box = await nav.appFrame.boundingBox();
    expect(box?.width).toBeGreaterThan(800);
  });

  test("XDV-03 core flow renders consistently across browsers/viewports", async ({ page }) => {
    // This same spec runs against chromium / firefox / webkit / mobile-chrome
    // projects defined in playwright.config.ts — run with `npx playwright test`.
    const nav = new NavPage(page);
    await nav.pharmacy.click();
    await expect(page.getByTestId("input-medicine-search")).toBeVisible();
  });
});
