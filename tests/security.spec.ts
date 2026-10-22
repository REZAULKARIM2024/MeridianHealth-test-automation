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

test.describe("Password policy & brute-force protection", () => {
  for (const weak of ["12345678", "abcdefgh", "password", "ABCDEFGH"]) {
    test(`SEC-18 signup rejects the weak password "${weak}"`, async ({ request }) => {
      const res = await request.post("/api/auth/signup", {
        data: { name: "Weak Pw", email: uniqueEmail("sec18"), password: weak },
      });
      expect(res.status()).toBe(400);
    });
  }

  test("SEC-19 repeated wrong passwords lock that account (429) without affecting other accounts", async ({ request }) => {
    const email = uniqueEmail("sec19");
    const other = uniqueEmail("sec19-other");
    for (const e of [email, other]) {
      await request.post("/api/auth/signup", { data: { name: "Lock Test", email: e, password: "SecurePass1" } });
    }
    for (let i = 0; i < 5; i++) {
      const bad = await request.post("/api/auth/login", { data: { email, password: "WrongPass99" } });
      expect(bad.status()).toBe(401);
    }
    // locked: even the correct password is refused while the lock lasts
    const locked = await request.post("/api/auth/login", { data: { email, password: "SecurePass1" } });
    expect(locked.status()).toBe(429);
    // a different account is unaffected
    const fine = await request.post("/api/auth/login", { data: { email: other, password: "SecurePass1" } });
    expect(fine.status()).toBe(200);
  });

  test("SEC-20 failed attempts against an unknown email lock too, so the lock reveals nothing", async ({ request }) => {
    const ghost = uniqueEmail("sec20-ghost");
    for (let i = 0; i < 5; i++) {
      expect((await request.post("/api/auth/login", { data: { email: ghost, password: "WrongPass99" } })).status()).toBe(401);
    }
    expect((await request.post("/api/auth/login", { data: { email: ghost, password: "WrongPass99" } })).status()).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Input validation on appointments / orders, injection on auth + trials, trial isolation
// ---------------------------------------------------------------------------
async function newUser(request: any, prefix: string) {
  const res = await request.post("/api/auth/signup", {
    data: { name: "Sec User", email: uniqueEmail(prefix), password: "SecurePass1" },
  });
  expect(res.status()).toBe(201);
  const { token } = await res.json();
  return { Authorization: `Bearer ${token}` };
}

const goodShipping = { address: "1 Test Street", city: "Testville", zip: "12345" };

test.describe("Input validation — appointments & orders", () => {
  const badAppointments: [string, any][] = [
    ["doctorId as array", { doctorId: ["d1"], slot: "9:00 AM" }],
    ["doctorId as object", { doctorId: { a: 1 }, slot: "9:00 AM" }],
    ["slot as number", { doctorId: "d1", slot: 900 }],
    ["reason as object", { doctorId: "d1", slot: "9:00 AM", reason: { x: 1 } }],
    ["reason over 500 characters", { doctorId: "d1", slot: "9:00 AM", reason: "a".repeat(501) }],
  ];
  for (const [label, data] of badAppointments) {
    test(`SEC-21 booking rejects bad input with 400 (${label})`, async ({ request }) => {
      const headers = await newUser(request, "sec21");
      const res = await request.post("/api/appointments", { headers, data });
      expect(res.status()).toBe(400);
    });
  }

  const badOrders: [string, any][] = [
    ["items contains null", { items: [null], ...goodShipping }],
    ["item is a bare string", { items: ["m2"], ...goodShipping }],
    ["qty is a string", { items: [{ medicineId: "m2", qty: "abc" }], ...goodShipping }],
    ["qty is fractional", { items: [{ medicineId: "m2", qty: 1.5 }], ...goodShipping }],
    ["qty missing", { items: [{ medicineId: "m2" }], ...goodShipping }],
    ["qty over the per-line cap", { items: [{ medicineId: "m2", qty: 100 }], ...goodShipping }],
    ["medicineId as object", { items: [{ medicineId: { a: 1 }, qty: 1 }], ...goodShipping }],
    ["address as number", { items: [{ medicineId: "m2", qty: 1 }], ...goodShipping, address: 5 }],
    ["zip as number", { items: [{ medicineId: "m2", qty: 1 }], ...goodShipping, zip: 12345 }],
  ];
  for (const [label, data] of badOrders) {
    test(`SEC-22 order rejects bad input with 400, not 500 (${label})`, async ({ request }) => {
      const headers = await newUser(request, "sec22");
      const res = await request.post("/api/orders", { headers, data });
      expect(res.status()).toBe(400);
    });
  }

  test("SEC-23 splitting one medicine across order lines cannot exceed its stock", async ({ request }) => {
    const headers = await newUser(request, "sec23");
    const list: any[] = await (await request.get("/api/medicines")).json();
    const med = list.find((m) => !m.rx && m.stock >= 1 && m.stock <= 99);
    test.skip(!med, "no non-Rx medicine with stock between 1 and 99");
    const res = await request.post("/api/orders", {
      headers,
      data: {
        items: [
          { medicineId: med.id, qty: med.stock },
          { medicineId: med.id, qty: med.stock },
        ],
        ...goodShipping,
      },
    });
    expect(res.status()).toBe(409);
    // and the stock was not touched by the rejected order
    const after: any[] = await (await request.get("/api/medicines")).json();
    expect(after.find((m) => m.id === med.id).stock).toBe(med.stock);
  });
});

test.describe("Injection on auth, trials & profile fields", () => {
  test("SEC-24 SQL-injection strings in login credentials never authenticate", async ({ request }) => {
    const victim = uniqueEmail("sec24");
    await request.post("/api/auth/signup", { data: { name: "Victim", email: victim, password: "SecurePass1" } });
    const attempts = [
      { email: "' OR '1'='1' --", password: "x" },
      { email: victim, password: "' OR '1'='1" },
      { email: `${victim}' --`, password: "SecurePass1" },
    ];
    for (const data of attempts) {
      const res = await request.post("/api/auth/login", { data });
      expect([400, 401]).toContain(res.status());
      expect(JSON.stringify(await res.json())).not.toContain("token");
    }
  });

  test("SEC-25 a SQL-injection payload in the name is stored literally and the schema survives", async ({ request }) => {
    const name = "Robert'); DROP TABLE users;--";
    const email = uniqueEmail("sec25");
    const signup = await request.post("/api/auth/signup", { data: { name, email, password: "SecurePass1" } });
    expect(signup.status()).toBe(201);
    expect((await signup.json()).user.name).toBe(name);
    // users table still exists and the account can log in
    const login = await request.post("/api/auth/login", { data: { email, password: "SecurePass1" } });
    expect(login.status()).toBe(200);
  });

  test("SEC-26 an XSS payload in the name is rendered as text, never executed", async ({ page }) => {
    let dialogFired = false;
    page.on("dialog", async (d) => {
      dialogFired = true;
      await d.dismiss();
    });
    const auth = new AuthPage(page);
    await auth.goto();
    await auth.signup("<img src=x onerror=alert(1)>", uniqueEmail("sec26"), "SecurePass1");
    await expect(page.getByTestId("nav-book")).toBeVisible();
    await page.waitForTimeout(500);
    expect(dialogFired).toBe(false);
    expect(await page.locator("img[src='x']").count()).toBe(0);
  });

  test("SEC-27 trial match and interest endpoints treat injection strings as data", async ({ request }) => {
    const match = await request.get("/api/trials/match?age=40&condition=" + encodeURIComponent("' OR 1=1 --"));
    expect(match.status()).toBe(200);
    expect(await match.json()).toHaveLength(0);

    const headers = await newUser(request, "sec27");
    const interest = await request.post("/api/trials/" + encodeURIComponent("t1' OR '1'='1") + "/interest", { headers });
    expect(interest.status()).toBe(404);
  });
});

test.describe("Authorization — trial interests are private", () => {
  test("SEC-28 one user's trial interest is not visible to another user", async ({ request }) => {
    const alice = await newUser(request, "sec28a");
    const bob = await newUser(request, "sec28b");
    expect((await request.post("/api/trials/t1/interest", { headers: alice })).status()).toBe(201);

    const aliceList = await (await request.get("/api/trials/interests/me", { headers: alice })).json();
    const bobList = await (await request.get("/api/trials/interests/me", { headers: bob })).json();
    expect(aliceList).toContain("t1");
    expect(bobList).not.toContain("t1");
  });

  test("SEC-29 interest in a trial that does not exist is a 404, not a crash", async ({ request }) => {
    const headers = await newUser(request, "sec29");
    const res = await request.post("/api/trials/does-not-exist/interest", { headers });
    expect(res.status()).toBe(404);
  });
});
