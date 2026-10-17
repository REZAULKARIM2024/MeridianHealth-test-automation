import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { NavPage } from "../pages/NavPage";
import { uniqueEmail } from "./utils";

/**
 * App lifecycle + web-equivalent "interrupt" tests.
 *
 * The original checklist's "Interrupt tests (call/SMS)" are a native-mobile
 * concept with no browser equivalent. The closest real things a web app has
 * to deal with are: the tab losing and regaining visibility, and the
 * browser back/forward buttons firing mid-flow — both covered here.
 */
test.describe("App Lifecycle", () => {
  test("LFC-01 a full page reload does not silently keep a stale session", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signup("Lifecycle User", uniqueEmail("lifecycle"), "SecurePass1");
    await expect(page.getByText(/Hi, Lifecycle/)).toBeVisible();

    // This app keeps auth state in memory only (no localStorage/sessionStorage
    // token persistence) — confirmed in source. A reload is expected to
    // return to the auth screen, not silently resume the session.
    await page.reload();
    await expect(page.getByTestId("tab-login")).toBeVisible();
  });

  test("LFC-02 logging in again after a reload works normally", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    const email = uniqueEmail("lifecycle-relogin");
    await auth.signup("Relogin User", email, "SecurePass1");
    await page.reload();
    await auth.login(email, "SecurePass1");
    await expect(page.getByText(/Hi, Relogin/)).toBeVisible();
  });
});

test.describe("Interrupt (web-equivalent)", () => {
   test("INT-01 the app never pushes browser history state, so Back/Forward cannot step through screens", async ({ page }) => {
    const auth = new AuthPage(page);
    const nav = new NavPage(page);
    await auth.goto();
    await auth.signup("Interrupt User", uniqueEmail("interrupt"), "SecurePass1");
    const before = await page.evaluate(() => history.length);

    await nav.book.click();
    await page.getByTestId("doctor-d1").click();
    await expect(page.getByTestId("slot-900AM")).toBeVisible();

    // GENUINE FINDING: the app is a single-page state machine that never
    // calls pushState, so moving between screens adds no history entries
    // and history.state stays empty. Back cannot return to a previous
    // screen; it leaves the app. Asserting the root cause (not the
    // engine-specific result of goBack) keeps this identical across
    // Chromium, Firefox and WebKit.
    const after = await page.evaluate(() => ({ length: history.length, state: history.state }));
    expect(after.length).toBe(before);
    expect(after.state).toBeNull();
  });
  test("INT-02 tab losing and regaining visibility mid-flow doesn't lose in-progress state", async ({ page }) => {
    const auth = new AuthPage(page);
    const nav = new NavPage(page);
    await auth.goto();
    await auth.signup("Visibility User", uniqueEmail("visibility"), "SecurePass1");
    await nav.book.click();
    await page.getByTestId("doctor-d1").click();
    await page.getByTestId("slot-900AM").click();
    await expect(page.getByTestId("slot-900AM")).toHaveAttribute("aria-pressed", "true");

    // Simulate the tab being backgrounded (e.g. the user switches apps to
    // take a call) and then foregrounded again, via the Page Visibility API.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await expect(page.getByTestId("slot-900AM")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("btn-book-appointment").click();

    await page.waitForFunction(
      () => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent?.includes("Appointment confirmed")) {
            const parent = node.parentElement;
            if (parent && parent.getClientRects().length > 0) return true;
          }
        }
        return false;
      },
      { timeout: 20_000 }
    );
  });
});
