import { test, expect, APIRequestContext } from "@playwright/test";
import { uniqueEmail } from "./utils";

/**
 * Acceptance-criteria tests for the two user stories in ai-test-design/stories/.
 * Each test is tagged with the criterion it verifies (BOOK-n / RX-n).
 *
 * Provenance: the cases were drafted by Claude directly from the stories (NOT by running
 * the qa-test-case-agent), reviewed against the API code, and kept only if they were not
 * already covered by an existing test. See ai-test-design/README.md.
 */

async function signup(request: APIRequestContext, prefix: string) {
  const res = await request.post("/api/auth/signup", {
    data: { name: "Story User", email: uniqueEmail(prefix), password: "SecurePass1" },
  });
  expect(res.status()).toBe(201);
  const { token } = await res.json();
  return { Authorization: `Bearer ${token}` };
}

async function medicines(request: APIRequestContext) {
  const list: any[] = await (await request.get("/api/medicines")).json();
  const inStock = (m: any) => m.stock === undefined || m.stock >= 1;
  return {
    rx: list.find((m) => m.rx && inStock(m)),
    otc: list.find((m) => !m.rx && inStock(m)),
  };
}

const shipping = { address: "1 Test Street", city: "Testville", zip: "12345" };

test.describe("Story: book a doctor appointment", () => {
  test("BOOK-2 booking without a slot is rejected with the documented message", async ({ request }) => {
    const headers = await signup(request, "book2");
    const res = await request.post("/api/appointments", { headers, data: { doctorId: "d1" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("Select a time slot to continue.");
  });

  test("BOOK-3 a slot the doctor does not offer is rejected", async ({ request }) => {
    const headers = await signup(request, "book3");
    const res = await request.post("/api/appointments", {
      headers,
      data: { doctorId: "d1", slot: "3:33 AM" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("That slot isn't available for this doctor.");
  });

  test("BOOK-4 the reason is optional", async ({ request }) => {
    const headers = await signup(request, "book4");
    const res = await request.post("/api/appointments", {
      headers,
      data: { doctorId: "d1", slot: "9:00 AM" },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).reason).toBeNull();
  });

  test("BOOK-5 a booking is visible to its owner only", async ({ request }) => {
    const owner = await signup(request, "book5a");
    const other = await signup(request, "book5b");
    const booked = await (
      await request.post("/api/appointments", {
        headers: owner,
        data: { doctorId: "d1", slot: "9:00 AM", reason: "isolation check" },
      })
    ).json();

    const otherList = await (await request.get("/api/appointments/me", { headers: other })).json();
    expect(otherList.some((a: any) => a.id === booked.id)).toBe(false);
    const ownerList = await (await request.get("/api/appointments/me", { headers: owner })).json();
    expect(ownerList.some((a: any) => a.id === booked.id)).toBe(true);
  });
});

test.describe("Story: order medicine with prescription gating", () => {
  test("RX-2 an order with an Rx item is rejected until the prescription is confirmed", async ({ request }) => {
    const headers = await signup(request, "rx2");
    const { rx } = await medicines(request);
    expect(rx, "seed data must contain an in-stock Rx medicine").toBeTruthy();
    const res = await request.post("/api/orders", {
      headers,
      data: { items: [{ medicineId: rx.id, qty: 1 }], ...shipping },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("Upload a valid prescription for Rx items in your cart.");
  });

  test("RX-3 an order with only non-Rx items needs no prescription", async ({ request }) => {
    const headers = await signup(request, "rx3");
    const { otc } = await medicines(request);
    expect(otc, "seed data must contain an in-stock non-Rx medicine").toBeTruthy();
    const res = await request.post("/api/orders", {
      headers,
      data: { items: [{ medicineId: otc.id, qty: 1 }], ...shipping },
    });
    expect(res.status()).toBe(201);
  });

  test("RX-4 a placed order is visible to its owner only", async ({ request }) => {
    const owner = await signup(request, "rx4a");
    const other = await signup(request, "rx4b");
    const { otc } = await medicines(request);
    const placed = await (
      await request.post("/api/orders", {
        headers: owner,
        data: { items: [{ medicineId: otc.id, qty: 1 }], ...shipping },
      })
    ).json();

    const otherOrders = await (await request.get("/api/orders/me", { headers: other })).json();
    expect(otherOrders.some((o: any) => o.id === placed.orderId)).toBe(false);
    const ownerOrders = await (await request.get("/api/orders/me", { headers: owner })).json();
    expect(ownerOrders.some((o: any) => o.id === placed.orderId)).toBe(true);
  });
});
