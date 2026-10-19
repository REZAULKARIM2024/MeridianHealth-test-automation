// k6 performance smoke test for the Meridian Health API.
//
// Purpose: a fast regression gate, not a load test. It drives the real read
// paths plus one authenticated write path at a modest, fixed request rate and
// FAILS the build (non-zero exit) if any SLO below is breached.
//
// Run locally (API on :4000, DB seeded):   k6 run perf/smoke.k6.js
// Override target:                         k6 run -e BASE_URL=http://host:4000 perf/smoke.k6.js
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:4000";

const loginTime = new Trend("login_duration", true);

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-arrival-rate",
      rate: 20,              // 20 iterations/s, independent of response time
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 60,
    },
  },
  // SLOs - the numbers a release must meet. Set at roughly 5-10x the p95 measured
  // on the GitHub Actions 2-vCPU runner (API + MySQL on one box); see the
  // baseline table in perf/README.md. Tight enough that a real regression
  // (e.g. a dropped index or an N+1 query) fails the build, loose enough to
  // absorb runner noise.
  thresholds: {
    http_req_failed: ["rate<0.01"],                       // < 1% errors
    checks: ["rate>0.99"],                                // > 99% checks pass
    "http_req_duration{endpoint:health}": ["p(95)<50"],
    "http_req_duration{endpoint:doctors}": ["p(95)<75"],
    "http_req_duration{endpoint:medicines}": ["p(95)<150"], // full catalog, no pagination
    "http_req_duration{endpoint:medicine_search}": ["p(95)<75"],
    "http_req_duration{endpoint:trials_match}": ["p(95)<75"],
    login_duration: ["p(95)<250"],                          // bcrypt compare is CPU-bound
    http_req_duration: ["p(99)<300"],                    // overall tail
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export function setup() {
  // One throwaway user for the login path. Unique per run.
  const email = `perf-${Date.now()}@meridianmail.test`;
  const res = http.post(
    `${BASE}/api/auth/signup`,
    JSON.stringify({ name: "Perf Smoke", email, password: "PerfSmoke1!" }),
    { headers: { "Content-Type": "application/json" } }
  );
  if (res.status !== 201) {
    throw new Error(`setup signup failed: ${res.status} ${res.body}`);
  }
  return { email, password: "PerfSmoke1!" };
}

export default function (data) {
  group("public reads", () => {
    let r = http.get(`${BASE}/api/health`, { tags: { endpoint: "health" } });
    check(r, { "health 200": (x) => x.status === 200 });

    r = http.get(`${BASE}/api/doctors`, { tags: { endpoint: "doctors" } });
    check(r, {
      "doctors 200": (x) => x.status === 200,
      "doctors non-empty": (x) => Array.isArray(x.json()) && x.json().length > 0,
    });

    r = http.get(`${BASE}/api/medicines`, { tags: { endpoint: "medicines" } });
    check(r, {
      "medicines 200": (x) => x.status === 200,
      "medicines non-empty": (x) => Array.isArray(x.json()) && x.json().length > 0,
    });

    r = http.get(`${BASE}/api/medicines?q=amox`, { tags: { endpoint: "medicine_search" } });
    check(r, { "search 200": (x) => x.status === 200 });

    r = http.get(`${BASE}/api/trials/match?age=45&condition=diabetes`, {
      tags: { endpoint: "trials_match" },
    });
    check(r, { "trials 200": (x) => x.status === 200 });
  });

  // The expensive path is login (bcrypt); exercise it on ~1 in 5 iterations
  // so it is measured without letting it dominate the run.
  if (__ITER % 5 === 0) {
    group("auth", () => {
      const r = http.post(
        `${BASE}/api/auth/login`,
        JSON.stringify({ email: data.email, password: data.password }),
        { headers: { "Content-Type": "application/json" }, tags: { endpoint: "login" } }
      );
      loginTime.add(r.timings.duration);
      check(r, {
        "login 200": (x) => x.status === 200,
        "login returns token": (x) => !!x.json("token"),
      });
    });
  }
  sleep(0.1);
}
