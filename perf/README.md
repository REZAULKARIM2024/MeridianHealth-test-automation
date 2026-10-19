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
| `GET /api/health` | p95 < 150 ms |
| `GET /api/doctors` | p95 < 400 ms |
| `GET /api/medicines` (full catalog, unpaginated) | p95 < 800 ms |
| `GET /api/medicines?q=` | p95 < 500 ms |
| `GET /api/trials/match` | p95 < 400 ms |
| `POST /api/auth/login` (bcrypt) | p95 < 900 ms |
| Everything | p99 < 1500 ms |

k6 exits non-zero (code 99) when a threshold is crossed, so the CI job goes red.
This was checked by deliberately tightening one threshold to 1 ms: the run failed with
`thresholds on metrics 'http_req_duration{endpoint:doctors}' have been crossed`.

## Baseline

One local run, API + MariaDB on the same machine, with the bulk dataset loaded
(1,500 medicines, 500 patients, 1,210 slots):

| Endpoint | p95 | SLO |
|---|---:|---:|
| health | 16 ms | 150 ms |
| doctors | 15 ms | 400 ms |
| medicines (1,500 rows) | 29 ms | 800 ms |
| medicine search | 11 ms | 500 ms |
| trials match | 5 ms | 400 ms |
| login (bcrypt cost 8) | 52 ms | 900 ms |

0 failed requests of 3,127; 100 % of 4,449 checks passed.

The SLOs are deliberately loose against this baseline (roughly 10-30x). A shared 2-vCPU
GitHub runner running the API and MySQL together is slower and noisier than a quiet
local box, and a smoke gate that flakes gets ignored. Once the CI job has a few weeks of
history in the `k6-results` artifacts, tighten each threshold to about 2-3x the
observed CI p95.

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
