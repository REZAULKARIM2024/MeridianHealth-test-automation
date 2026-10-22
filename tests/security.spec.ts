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

test.describe("Authentication & input hardening", () => {
  const json = { "Content-Type": "application/json" };

  test("SEC-11 login failure is identical for a wrong password and an unknown email (no user enumeration)", async ({ request }) => {
    const email = uniqueEmail("sec11");
    await request.post("/api/auth/signup", { data: { name: "Enum Test", email, password: "SecurePass1" } });
    const wrongPw = await request.post("/api/auth/login", { data: { email, password: "WrongPass99" } });
    const noUser = await request.post("/api/auth/login", {
      data: { email: uniqueEmail("sec11-nobody"), password: "WrongPass99" },
    });
    expect(wrongPw.status()).toBe(401);
    expect(noUser.status()).toBe(401);
    expect(await wrongPw.json()).toEqual(await noUser.json());
  });

  test("SEC-12 auth responses never expose the password or its hash", async ({ request }) => {
    const email = uniqueEmail("sec12");
    const signup = await request.post("/api/auth/signup", { data: { name: "Leak Test", email, password: "SecurePass1" } });
    const login = await request.post("/api/auth/login", { data: { email, password: "SecurePass1" } });
    for (const res of [signup, login]) {
      const body = await res.text();
      expect(body).not.toMatch(/password|\$2[aby]\$/i);
    }
  });

  test("SEC-13 an unsigned (alg=none) token is rejected", async ({ request }) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ id: 1, name: "x", email: "x@x.co" })}.`;
    const res = await request.get("/api/appointments/me", { headers: { Authorization: `Bearer ${unsigned}` } });
    expect(res.status()).toBe(401);
  });

  test("SEC-14 a valid token with a tampered payload (privilege swap) is rejected", async ({ request }) => {
    const signup = await request.post("/api/auth/signup", {
      data: { name: "Tamper Test", email: uniqueEmail("sec14"), password: "SecurePass1" },
    });
    const [h, , sig] = (await signup.json()).token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ id: 1, name: "Admin", email: "admin@example.com" })).toString("base64url");
    const res = await request.get("/api/appointments/me", {
      headers: { Authorization: `Bearer ${h}.${forgedPayload}.${sig}` },
    });
    expect(res.status()).toBe(401);
  });

  test("SEC-15 extra signup fields (id, role) are ignored - no mass assignment", async ({ request }) => {
    const res = await request.post("/api/auth/signup", {
      data: { name: "Mass Assign", email: uniqueEmail("sec15"), password: "SecurePass1", id: 1, role: "admin" },
    });
    expect(res.status()).toBe(201);
    const { user, token } = await res.json();
    expect(user.id).not.toBe(1);
    expect(user.role).toBeUndefined();
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.role).toBeUndefined();
    expect(payload.id).toBe(user.id);
  });

  test("SEC-16 a malformed JSON body gets a clean 400, not a 500", async ({ request }) => {
    const res = await request.post("/api/auth/login", { headers: json, data: "{bad json" });
    expect(res.status()).toBe(400);
  });

  for (const [label, path, body] of [
    ["login: password as object", "/api/auth/login", { email: "a@b.co", password: { x: 1 } }],
    ["login: password as number", "/api/auth/login", { email: "a@b.co", password: 12345678 }],
    ["signup: name as number", "/api/auth/signup", { name: 123, email: "a@b.co", password: "SecurePass1" }],
    ["signup: password as number", "/api/auth/signup", { name: "x", email: "a@b.co", password: 12345678 }],
    ["signup: password as array", "/api/auth/signup", { name: "x", email: "a@b.co", password: ["SecurePass1"] }],
  ] as const) {
    test(`SEC-17 wrong-typed JSON field is a 400, not a 500 (${label})`, async ({ request }) => {
      const res = await request.post(path, { data: body });
      expect(res.status()).toBe(400);
    });
  }
});
