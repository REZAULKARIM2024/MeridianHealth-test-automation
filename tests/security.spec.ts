import { test, expect } from "@playwright/test";
import { AuthPage } from "../pages/AuthPage";
import { uniqueEmail } from "./utils";

test.describe("API-integrated (unauthenticated)", () => {
  test("SEC-03 booking without a token is rejected with 401", async ({ request }) => {
    const res = await request.post("/api/appointments", {
      data: { doctorId: "d1", slot: "9:00 AM" },
    });
    expect(res.status()).toBe(401);
  });

  test("SEC-04 fetching my appointments without a token is rejected with 401", async ({ request }) => {
    const res = await request.get("/api/appointments/me");
    expect(res.status()).toBe(401);
  });

  test("SEC-05 a malformed/tampered token is rejected, not silently accepted", async ({ request }) => {
    const res = await request.post("/api/appointments", {
      headers: { Authorization: "Bearer not-a-real-jwt" },
      data: { doctorId: "d1", slot: "9:00 AM" },
    });
    expect(res.status()).toBe(401);
  });

  test("SEC-06 a token signed with the wrong secret is rejected", async ({ request }) => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJpZCI6OTk5OTk5LCJuYW1lIjoiRm9yZ2VkIiwiZW1haWwiOiJmb3JnZWRAZXhhbXBsZS5jb20ifQ." +
      "invalidSignatureThatWontVerify";
    const res = await request.post("/api/appointments", {
      headers: { Authorization: `Bearer ${forged}` },
      data: { doctorId: "d1", slot: "9:00 AM" },
    });
    expect(res.status()).toBe(401);
  });

  test("SEC-07 expressing trial interest without a token is rejected with 401", async ({ request }) => {
    const res = await request.post("/api/trials/t1/interest");
    expect(res.status()).toBe(401);
  });
});

test.describe("Security — injection & XSS safety", () => {
  test("SEC-08 SQL-injection-style search input is treated as a literal string", async ({ request }) => {
    const res = await request.get("/api/medicines?q=" + encodeURIComponent("' OR '1'='1"));
    expect(res.status()).toBe(200);
    const meds = await res.json();
    expect(meds).toHaveLength(0);
  });

  test("SEC-09 an XSS payload in the booking reason is stored inert, never executed", async ({ page }) => {
    const auth = new AuthPage(page);
    await auth.goto();
    const email = uniqueEmail("xss");
    await auth.signup("XSS Test", email, "SecurePass1");

    let dialogFired = false;
    page.on("dialog", async (d) => {
      dialogFired = true;
      await d.dismiss();
    });

    await page.getByTestId("nav-book").click();
    await page.getByTestId("doctor-d1").click();
    await page.getByTestId("slot-900AM").click();
    await expect(page.getByTestId("slot-900AM")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("input-reason").fill('<script>alert("xss")</script>');
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

    expect(dialogFired).toBe(false);
  });
});

test.describe("Security response headers", () => {
  test("SEC-10 API responses carry standard security headers and don't advertise the framework", async ({ request }) => {
    const res = await request.get("/api/doctors");
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBeTruthy();
    expect(h["content-security-policy"]).toBeTruthy();
    // Express advertises itself by default; that header only helps attackers.
    expect(h["x-powered-by"]).toBeUndefined();
  });
});
