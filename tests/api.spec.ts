import { test, expect } from "@playwright/test";
import { uniqueEmail } from "./utils";

test.describe("API-integrated", () => {
  test("API-01 signup returns a user object and JWT", async ({ request }) => {
    const email = uniqueEmail("api-signup");
    const res = await request.post("/api/auth/signup", {
      data: { name: "API Test User", email, password: "SecurePass1" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.user).toMatchObject({ name: "API Test User", email });
    expect(typeof body.token).toBe("string");
    expect(body.token.split(".")).toHaveLength(3);
    expect(body.user.password).toBeUndefined();
  });

  test("API-02 login with correct credentials returns a token", async ({ request }) => {
    const email = uniqueEmail("api-login");
    await request.post("/api/auth/signup", {
      data: { name: "Login API User", email, password: "SecurePass1" },
    });
    const res = await request.post("/api/auth/login", {
      data: { email, password: "SecurePass1" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.token).toBe("string");
  });

  test("API-03 GET /api/doctors returns seeded doctors with slots", async ({ request }) => {
    const res = await request.get("/api/doctors");
    expect(res.status()).toBe(200);
    const doctors = await res.json();
    expect(Array.isArray(doctors)).toBe(true);
    expect(doctors.length).toBeGreaterThanOrEqual(4);
    const d1 = doctors.find((d: any) => d.id === "d1");
    expect(d1).toBeTruthy();
    expect(Array.isArray(d1.slots)).toBe(true);
    expect(d1.slots).toContain("9:00 AM");
  });

  test("API-04 GET /api/medicines returns seeded catalog with rx flag", async ({ request }) => {
    const res = await request.get("/api/medicines");
    expect(res.status()).toBe(200);
    const meds = await res.json();
    const rxItem = meds.find((m: any) => m.id === "m1");
    expect(rxItem.rx).toBe(true);
    const otcItem = meds.find((m: any) => m.id === "m2");
    expect(otcItem.rx).toBe(false);
  });

  test("API-05 GET /api/medicines?q= filters server-side", async ({ request }) => {
    const res = await request.get("/api/medicines?q=Ibuprofen");
    const meds = await res.json();
    expect(meds.every((m: any) => m.name.toLowerCase().includes("ibuprofen"))).toBe(true);
  });

  test("API-06 booking an appointment persists and is retrievable via GET /me", async ({ request }) => {
    const email = uniqueEmail("api-booking");
    const signup = await request.post("/api/auth/signup", {
      data: { name: "Booking API User", email, password: "SecurePass1" },
    });
    const { token } = await signup.json();

    const book = await request.post("/api/appointments", {
      headers: { Authorization: `Bearer ${token}` },
      data: { doctorId: "d1", slot: "9:00 AM" },
    });
    expect(book.status()).toBe(201);
    const booked = await book.json();
    expect(booked.doctor.id).toBe("d1");

    const mine = await request.get("/api/appointments/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = await mine.json();
    expect(list.some((a: any) => a.id === booked.id)).toBe(true);
  });

  test("API-07 booking with an invalid doctor id returns 404, not a crash", async ({ request }) => {
    const email = uniqueEmail("api-badbooking");
    const signup = await request.post("/api/auth/signup", {
      data: { name: "Bad Booking User", email, password: "SecurePass1" },
    });
    const { token } = await signup.json();

    const res = await request.post("/api/appointments", {
      headers: { Authorization: `Bearer ${token}` },
      data: { doctorId: "does-not-exist", slot: "9:00 AM" },
    });
    expect(res.status()).toBe(404);
  });

  test("API-08 trial matching returns only trials in the eligible age range", async ({ request }) => {
    const res = await request.get("/api/trials/match?age=45&condition=diabetes");
    expect(res.status()).toBe(200);
    const matches = await res.json();
    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("t1");
  });

  test("API-09 trial matching rejects an out-of-range age with 400", async ({ request }) => {
    const res = await request.get("/api/trials/match?age=200&condition=diabetes");
    expect(res.status()).toBe(400);
  });

  test("API-11 signup rejects a name over 120 characters with a clean 400", async ({ request }) => {
    // users.name is VARCHAR(120) in the schema. Before this test's underlying
    // fix (see FORM_VALIDATION_REPORT.md), a too-long name reached MySQL
    // uncaught and came back as a raw 500 (ER_DATA_TOO_LONG) instead of a
    // proper validation error — found via live testing, not assumed.
    const email = uniqueEmail("api-longname");
    const tooLong = "A".repeat(121);
    const res = await request.post("/api/auth/signup", {
      data: { name: tooLong, email, password: "SecurePass1" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/120 characters/);
  });

  test("API-12 signup accepts a name at exactly the 120-character boundary", async ({ request }) => {
    const email = uniqueEmail("api-boundaryname");
    const exactly120 = "B".repeat(120);
    const res = await request.post("/api/auth/signup", {
      data: { name: exactly120, email, password: "SecurePass1" },
    });
    expect(res.status()).toBe(201);
  });
});
