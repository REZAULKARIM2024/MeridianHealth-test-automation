# Performance smoke (k6)

A fast regression gate for the Meridian Health API - **not** a capacity test. It sends a
fixed 20 iterations/second for 30 s (about 3,100 requests) at the real read paths plus
the login path, and fails the build if any SLO is breached.

```bash
# API on :4000 with the DB seeded (npm run serve:full, or npm start --prefix server)
npm run perf:smoke                                  # needs k6 installed
k6 run -e BASE_URL=http://host:4000 perf/smoke.k6.js
```

## SLOs (enforced as k6 thresholds)

| Scope | SLO |
|---|---|
| Errors | `http_req_failed` < 1 % |
| Correctness under load | > 99 % of `checks` pass (status + non-empty payload + token returned) |
| `GET /api/health` | p95 < 50 ms |
| `GET /api/doctors` | p95 < 75 ms |
| `GET /api/medicines` (full catalog, unpaginated) | p95 < 150 ms |
| `GET /api/medicines?q=` | p95 < 75 ms |
| `GET /api/trials/match` | p95 < 75 ms |
| `POST /api/auth/login` (bcrypt) | p95 < 250 ms |
| Everything | p99 < 300 ms |

k6 exits non-zero (code 99) when a threshold is crossed, so the CI job goes red.
This was checked by deliberately tightening one threshold to 1 ms: the run failed with
`thresholds on metrics 'http_req_duration{endpoint:doctors}' have been crossed`.

## Baseline (GitHub Actions, ubuntu-latest, API + MySQL 8 on one runner)

From the first passing CI run (3,121 requests, 0 % errors):

| Endpoint | avg | p95 | p99 | SLO (p95) |
|---|---:|---:|---:|---:|
| health | 0.5 ms | 0.8 ms | 1.3 ms | 50 ms |
| doctors | 1.0 ms | 1.4 ms | 2.1 ms | 75 ms |
| medicines (base seed) | 0.5 ms | 0.7 ms | 1.5 ms | 150 ms |
| medicine search | 0.6 ms | 0.7 ms | 1.7 ms | 75 ms |
| trials match | 0.6 ms | 0.7 ms | 1.6 ms | 75 ms |
| login (bcrypt cost 8) | 14.8 ms | 16.0 ms | 16.6 ms | 250 ms |
| overall | 1.2 ms | 1.7 ms | 15.0 ms | p99 300 ms |

The medicines row is the base seed (a handful of rows) because the bulk dataset is not
committed to the repo; with the 1,500-row bulk catalog loaded locally (slower machine) its
p95 was about 29 ms, still inside the SLO. A local run with that dataset had login p95 at
about 52 ms.

**How the SLOs were set.** They sit at roughly 5-10x the CI p95, or about 3x the slowest
local figure, on purpose: tight enough that a real regression (a dropped index, an N+1
query, a bcrypt cost bump) fails the build, loose enough that shared-runner noise does not
make the gate flaky. This is based on a single CI sample; re-check them against the
`k6-results` artifacts after a few weeks of nightly runs and adjust.

## CI

`.github/workflows/perf.yml` runs on push/PR to `main`, nightly at 07:00 UTC, and on
demand. It starts MySQL, seeds the database (plus the bulk dataset when the files are in
`server/src/`), starts the API, runs k6, writes a per-endpoint table to the run summary,
and uploads `k6-summary.json` as the `k6-results` artifact.

## Known limits

- `GET /api/medicines` returns the whole catalog with no pagination. It passes the SLO
  today, but response size grows linearly with catalog size, and it is the first
  endpoint to look at if that SLO starts to fail.
- Single endpoint mix, no ramp, no soak. Add a `stages` scenario if a real capacity
  number is needed.
