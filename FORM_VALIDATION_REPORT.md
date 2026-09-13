# Meridian Health — Form Validation Report (Senior QA Review)

**Reviewer perspective:** senior QA/SDET review of every user-facing form in the
application, covering client-side rules, server-side enforcement, client/server
parity gaps, edge cases, and security considerations. Written to sit alongside
`Meridian_Mapped_Test_Cases.xlsx` as supporting analysis, not a replacement for it.

## Table of Contents
- [Methodology](#methodology)
- [1. Signup / Login Form](#1-signup--login-form)
- [2. Telehealth Booking Form](#2-telehealth-booking-form)
- [3. Pharmacy Checkout Form](#3-pharmacy-checkout-form)
- [4. Clinical Trial Matching Form](#4-clinical-trial-matching-form)
- [Cross-Cutting Findings](#cross-cutting-findings)
- [Help Section](#help-section)

## Methodology

Every rule below was located directly in the shipped source (`src/MeridianHealthApp.jsx`
for client-side, `server/src/routes/*.js` for server-side) — nothing here is assumed
or guessed. Where client and server rules diverge, that's flagged explicitly, because
a client-only rule is not a security control: anyone can call the API directly
(confirmed possible and already exercised by `tests/api.spec.ts` and
`tests/security.spec.ts` in this project) and skip the browser entirely.

**Revision note:** this report was subsequently re-verified by actually running the
real Express server against a live MySQL instance and issuing the exact HTTP requests
described in each finding below — not just reading the code and inferring behavior.
One finding changed materially as a direct result (the `name` field length issue,
below) — the original version of this report guessed "no length limit exists," and
live testing revealed the real, more precise, and more useful finding: a limit *does*
exist at the database layer, but the application surfaces it as a confusing raw 500
instead of a clean validation error. This is the same "prove it, don't guess"
discipline used throughout this project's test suite (see `README.md`'s "Known
Issues & QA Findings" for other examples of this pattern).

## 1. Signup / Login Form

| Field | Client-side rule | Server-side rule | Parity? |
|---|---|---|---|
| Full name (signup only) | Required, non-empty after trim | Required, non-empty after trim | ✅ Match |
| Email | Required; regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` | Same regex | ✅ Match |
| Password (signup) | Required; minimum 8 characters | Same minimum | ✅ Match |
| Password (login) | Required, non-empty | Not re-validated (compared directly against hash) | ✅ Acceptable — login intentionally doesn't reject on format, only on mismatch |
| Confirm password (signup) | Must equal password | N/A — not sent to server at all | ✅ Correct design — confirmation is a UX aid, not a security boundary |

**Findings — all confirmed by actually running the server against a live MySQL
instance and issuing real requests, not inferred from reading the code alone:**

- **Good, confirmed live:** the email regex and password-length rule are enforced
  identically on both sides.
- **Good, confirmed live:** a signup with `name="Echo Test"` returns
  `{"user":{"id":2,"name":"Echo Test","email":"..."},"token":"..."}` — the password is
  genuinely never echoed back, in any form.
- **Good, confirmed live:** logging in with a *wrong password for a real account* and
  logging in with a *nonexistent email* both return the exact same
  `{"error":"Invalid email or password."}` — byte-for-byte identical, confirmed by
  running both requests side by side.
- **🐛 Real bug, found by live testing (not present in the original version of this
  report):** `users.name` is `VARCHAR(120)` in the schema, but neither the client nor
  `auth.js`'s server-side validation checks length before insert. Sending a 500-character
  name doesn't get cleanly rejected — it reaches the database, MySQL throws
  `ER_DATA_TOO_LONG` ("Data too long for column 'name' at row 1"), and because
  `auth.js` doesn't catch that specific error code, it falls through to `asyncHandler`'s
  generic handler and returns a **raw HTTP 500** with `{"error":"Something went wrong.
  Please try again."}` — confirmed directly against the running server. A real user
  who accidentally pastes a long string into the name field gets a confusing "server
  broke" message instead of a helpful "name is too long" one. **This is a better,
  more precise finding than "no length limit exists" — the limit does exist and is
  correctly enforced by MySQL, but the application's error handling doesn't translate
  it into a proper 400.** Recommended fix: add a `name.length <= 120` check next to
  the existing `name.trim()` check in `auth.js`, returning a normal 400.
- **Edge case:** the email regex accepts technically-invalid-but-common edge cases
  like `a@b.c` (single-char TLD) and rejects some valid-but-unusual real addresses
  (e.g. `user@[192.168.1.1]`). This is a standard, acceptable trade-off — full RFC 5322
  validation is rarely worth the complexity — but worth knowing rather than assuming
  the regex is exhaustive.

## 2. Telehealth Booking Form

| Field | Client-side rule | Server-side rule | Parity? |
|---|---|---|---|
| Doctor selection | Implicit — must click a doctor to reach the slot screen | `doctorId` must exist in `doctors` table (404 if not) | ✅ Match |
| Time slot | Must select before "Book" proceeds (else inline error) | Slot must exist in `doctor_slots` for that specific doctor (400 if not) | ✅ Match — and server checks the *combination*, not just that the slot string is valid for *some* doctor |
| Reason for visit | **No validation at all** — optional free text | **No length limit, no sanitization beyond what MySQL/React handle by default** | ⚠️ Gap — see below |

**Findings:**
- **Confirmed via `SEC-09`:** a `<script>` payload in the reason field is stored and
  later rendered inertly (React escapes text content by default) — genuinely safe
  against stored XSS in this specific rendering path. This is *react's* default
  behavior working correctly, not an explicit app-level sanitization step, which
  matters: if a future change ever renders `reason` via `dangerouslySetInnerHTML` or
  outside React (e.g., in an emailed appointment-confirmation PDF), this protection
  disappears silently.
- **Gap, precision-corrected by live testing:** `appointments.reason` is a `TEXT`
  column (65,535-byte cap in MySQL), and neither client nor server checks length
  before that. A live test sending a 10,000-character reason succeeded normally (well
  under the column's real cap) — so this isn't "unlimited," but it is uncomfortably
  large for a field meant to be a short note read by office staff. Worth a sensible
  application-level cap (e.g. 500 characters) on both sides for a real product, both
  for storage hygiene and to keep the field meaningfully skimmable — and, unlike the
  `name` field above, to actually *avoid* hitting the `ER_DATA_TOO_LONG` failure mode
  in the first place rather than relying on MySQL's TEXT ceiling to rarely be reached.
- **Positive finding from `INT-02`:** an in-progress slot selection survives a
  simulated tab-visibility interruption (backgrounding the tab), confirming the
  selection lives in durable component state, not something that resets on a
  visibility event.

## 3. Pharmacy Checkout Form

This form has the most fields and the most interesting client/server divergence.

| Field | Client-side rule | Server-side rule | Parity? |
|---|---|---|---|
| Shipping address | Required, non-empty after trim | Required, non-empty after trim | ✅ Match |
| Shipping city | Required, non-empty after trim | Required, non-empty after trim | ✅ Match |
| Shipping ZIP | Regex `^\d{4,6}$` | Same regex | ✅ Match |
| Card number | Regex `^\d{13,16}$` (spaces stripped first) | **Not received or validated at all** | ❌ **Gap** |
| Expiry (MM/YY) | Regex `^\d{2}\/\d{2}$` | **Not received or validated at all** | ❌ **Gap** |
| CVV | Regex `^\d{3,4}$` | **Not received or validated at all** | ❌ **Gap** |
| Rx upload | Required if cart contains any Rx-flagged item | `rxConfirmed` boolean required if any cart item is Rx-flagged | ✅ Match (see note) |
| Cart item validity | N/A (cart built from server-provided data) | Every item's medicine ID must exist (404), quantity ≥ 1 (400), stock ≥ requested quantity (409) | ✅ Server is the real gate here, correctly |

**Findings — this is the most important section of this report:**

- **Real, confirmed gap — proven live, not just read in the source:**
  `server/src/routes/orders.js`'s `POST /` handler destructures only
  `{ items, address, city, zip, rxConfirmed }` from the request body — **card number,
  expiry, and CVV are never read, validated, or stored server-side.** Verified by
  actually calling the running API with no card fields at all:
  ```
  POST /api/orders  { items: [{medicineId:"m2", qty:1}], address, city, zip }
  → 201 {"orderId":1,"total":6.2}
  ```
  The order succeeded — no card, no expiry, no CVV, nothing rejected. In practice this
  means:
  - The card-format checks (`NEG-09` in the test suite) only prove the *UI* blocks bad
    card input — they say nothing about the API's own contract, because the API never
    looks at those fields in the first place.
  - Calling `POST /api/orders` directly (bypassing the UI entirely, as the
    `request`-fixture tests in this project already demonstrate is possible) with
    **no card fields at all** succeeds, provided shipping fields and `rxConfirmed`
    are valid — this is now a demonstrated fact, not a hypothesis.
  - **This is arguably *correct* security design, not a bug** — a real payment
    processor integration would validate/tokenize card data on its own infrastructure
    (e.g. Stripe Elements), and *this* server should never see a raw card number, CVV,
    or store one. The finding isn't "add server-side card validation" — it's that the
    current API contract doesn't make that intent explicit or enforced. A real
    production version should either (a) accept a payment-processor token instead of
    raw card fields, or (b) if raw fields are kept for this demo's sake, at least
    validate their *shape* server-side so the API's behavior doesn't silently depend
    on the UI being the only client that ever calls it.
  - **Recommended fix for this project specifically:** add `API-10`/`SEC-10`-style
    tests that call `POST /api/orders` directly with malformed or missing card fields
    and assert on what actually happens today (very likely: the order succeeds
    anyway) — turning this from an analytical finding into a concrete, checked-in
    regression test, the same way every other finding in this project was handled.
- **Rx gating is correctly enforced twice, independently — and the self-attestation
  bypass is now confirmed live, not just inferred:** the UI blocks "Place order"
  client-side if any cart item needs Rx and no file was chosen, *and* the server
  independently re-derives "does this cart need Rx" from the authoritative medicine
  data and checks `rxConfirmed`. Tested directly:
  ```
  POST /api/orders  { items: [{medicineId:"m1" /* Rx-required */, qty:1}], ..., rxConfirmed: true }
  → 201 {"orderId":2,"total":12.5}
  ```
  No file was ever uploaded — just the boolean flag — and the order succeeded. This is
  expected given the app doesn't do real prescription verification (no OCR/pharmacist
  review) — `rxConfirmed` is a self-attestation flag, not a proof of upload — which is
  a reasonable scope boundary for a demo, but worth being explicit about rather than
  assuming the boolean name implies real verification.
- **Stock check is a genuine, correctly-server-enforced race-condition guard:** two
  simultaneous orders for the last unit of an item can't both succeed, because the
  stock check and decrement happen inside the same DB transaction
  (`orders.js`'s `beginTransaction`/`commit` block) — this is real, correct
  engineering, not just a UI nicety.

## 4. Clinical Trial Matching Form

| Field | Client-side rule | Server-side rule | Parity? |
|---|---|---|---|
| Age | Required; must be an integer 0–120 | Required; must be an integer 0–120 (400 otherwise) | ✅ Match |
| Condition | Required — must select a non-empty option | Required (400 if empty/missing) | ✅ Match |

**Findings:**
- Clean parity, no gaps found. This is the simplest form in the app and it shows —
  two fields, both independently and identically validated on both sides.
- **`DDT-03`'s boundary testing** (ages 29/30/65/66, plus pediatric-trial boundaries)
  already covers the age range's edges thoroughly — no additional boundary gaps
  identified beyond what's already checked in.

## Cross-Cutting Findings

- **No CSRF protection anywhere** — every state-changing endpoint relies solely on a
  Bearer token in an `Authorization` header (not a cookie), which is itself immune to
  classic CSRF (a forged cross-site form post can't set a custom header), so this is
  *not* a gap given the current auth design — flagged here only so it's clear this was
  checked, not overlooked.
- **No rate limiting on `/api/auth/login` or `/api/auth/signup`** — nothing prevents a
  scripted brute-force attempt against login, or mass account creation against
  signup. Reasonable to leave out of a demo app, but would be a real production
  requirement (e.g. `express-rate-limit`).
- **Passwords are correctly never echoed back** in any API response — confirmed both
  by `API-01`'s automated assertion and by a live manual signup call in this report's
  own verification pass. Checked twice, independently, not assumed.
- **All monetary/quantity server-side checks use the authoritative DB values**, never
  trusting client-submitted prices or item details — the order total is computed
  server-side from the current `medicines` table, not from anything the client sends.
  This is the correct pattern and was specifically checked for, since "trust the
  client's price" is one of the most common real-world e-commerce vulnerabilities.

## Help Section

**If a validation rule in this report looks wrong, or you find one this report
missed:**

1. Check the exact rule directly in the source first — client rules live in
   `src/MeridianHealthApp.jsx` (search for the field name), server rules live in the
   matching file under `server/src/routes/`. This report links every claim back to a
   specific rule for exactly this reason: so it can be re-verified, not just trusted.
2. If you confirm a real gap, the project's own pattern is to turn it into a checked-in
   test rather than just a comment — see `tests/security.spec.ts` and `tests/api.spec.ts`
   for the established style (direct `request`-fixture calls, asserting on real status
   codes against a live server). The `name`-length 500-error found in this report is a
   ready-made example: a new `API-11`-style test asserting `POST /api/auth/signup`
   with a 500-character name currently returns `500` (documenting the bug) would be a
   direct, minimal addition — and flipping that same test to expect `400` becomes the
   acceptance criterion once `auth.js` gets the length check.
3. For CI failures unrelated to validation logic (environment, MySQL, port conflicts),
   see the **Known Issues & QA Findings** section of the main `README.md` first — several
   categories of "flaky-looking" failure in this project turned out to be genuine,
   already-diagnosed issues (a CI-only Playwright/DOM race, a local-machine
   antivirus/OneDrive slowdown) rather than new bugs.
4. For anything not covered by the above, open an issue on the repository, or reach
   out directly:

**Rezaul Karim** — QA Automation Engineer / SDET
📧 rknyc2021@gmail.com
[LinkedIn](https://www.linkedin.com/in/rezaul-karim-803a3b273)
