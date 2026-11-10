# Lumen-X · Cloudflare edition

A second implementation of Lumen-X that runs on the **free** Cloudflare plan: a Worker, a D1 database and
Cloudflare Access for the login. The full stack in the rest of the repo (.NET + Python + PostgreSQL) stays as it is.

**Status: work in progress.** Done: the forecasting engine and the Worker API (login check, database, CSV import,
forecast, reorder), tested in Node and in the real Workers runtime. Next: the dashboard, the explanations and the questions,
and the setup guide for Cloudflare. Nothing is deployed yet.

## Why a second implementation

The free Cloudflare plan cannot run ASP.NET Core, Python or PostgreSQL. It can run a Worker (JavaScript/TypeScript,
about 10 ms of CPU per request on the free plan), a D1 database (SQLite) and, in front of them, Cloudflare Access
(login by email code or Google, free up to 50 users, one click on a `workers.dev` address, no domain needed).
So the engine had to be rewritten in TypeScript.

## How it works

```
browser ──► Cloudflare Access (login, email code) ──► Worker ──► D1
                                                       │
                                                       └─ static files of the dashboard (public/)
```

- **Login.** Access logs the user in at the edge and adds a signed token to every request. The Worker checks that token
  anyway (signature, issuer, audience, expiry) and takes the user's email from it. With the settings missing, every
  request to the API is refused. Preview URLs are switched off, because they would be public.
- **Every user sees only his own data.** Each product belongs to an email, and every query goes through it. Another user's
  product answers *404*, never *403*, so its existence is not revealed.
- **Cross-site requests are refused** (a POST whose `Origin` is not the site's own), so a page on another site cannot act with the user's login.

## The API

All answers are JSON; errors have the same shape as the .NET backend (`title`, `status`, `detail`).

| Route | What it does |
| --- | --- |
| `GET /api/me` | the email of the user |
| `GET /api/products`, `POST /api/products` | list, create (`{ "name": "...", "sku": "..." }`) |
| `GET /api/products/:id`, `DELETE /api/products/:id` | read, delete (with its sales and forecasts) |
| `POST /api/products/:id/sales/import` | upload a CSV (`multipart/form-data`, field `file`); same rules and messages as the .NET backend |
| `GET /api/products/:id/sales?from=&to=` | the daily sales |
| `POST /api/products/:id/forecast` | `{ "horizon": 28, "method": "auto" }` (both optional); saves and returns the forecast with its backtest |
| `GET /api/products/:id/forecast` | the latest forecast |
| `GET /api/products/:id/reorder?leadTimeDays=7&reviewDays=7&serviceLevel=95&onHand=` | the reorder suggestion (safety stock) |

**Limits per user** (so a runaway upload cannot use up the free plan): 10 products, 1 MB and 5,000 rows per upload,
3,650 days of sales per product; only the last 5 forecasts of a product are kept.

## What is the same and what is not

| | Full stack (.NET + Python) | Cloudflare edition |
| --- | --- | --- |
| Methods | weekly naive, ETS, LightGBM, and the average of ETS and LightGBM | weekly naive and ETS |
| Backtest | 3 consecutive windows, pooled errors | the same windows, the same rules |
| Interval | 80% band: forecast ± 1.2816 × backtest RMSE | the same |
| CSV import, reorder suggestion | yes | yes, same rules and same messages |

**Accuracy.** On the real Bread series of the demo (1684 days, 3 windows of 28 days, the 4 missing Christmas days filled in),
the error (RMSE) is:

| Method | RMSE |
| --- | --- |
| Weekly naive | 226.7 (identical in both implementations) |
| ETS, TypeScript | 187.9 |
| ETS, Python (statsmodels) | 183.2 |
| Average of ETS and LightGBM (full stack only) | 170.4 |

The TypeScript ETS is about 2.6% worse than statsmodels: it picks its parameters from a small grid instead of running a
numerical optimizer, to stay around a millisecond of CPU. This edition has no average with LightGBM, which is about 10%
better than its ETS on this series. It is still about 17% better than the naive method.

## Run it

```bash
cd cloudflare
npm install
npm test          # 142 tests (vitest): engine, login, API on a real SQLite database
npm run typecheck # tsc
npm run e2e       # the Worker in the real Workers runtime (workerd), locally, with the real Bread series
```

`npm run e2e` starts the Worker with a local D1 database, signs login tokens with a throwaway key (a small local server
plays the role of Cloudflare Access) and checks: login, isolation between users, CSV import of 1684 days, forecast, reorder,
cross-site POST, tampered token. Nothing leaves your machine.

## Layout

```
src/engine/   csv.ts (import rules), series.ts (daily series, gaps filled), models.ts (naive, ETS),
              forecast.ts (backtest, choice of method, interval), reorder.ts (safety stock)
src/worker/   index.ts (entry point), auth.ts (login check), api.ts (routes), db.ts (queries), limits.ts, http.ts
migrations/   0001_init.sql (the D1 schema)
public/       the dashboard (a placeholder for now: it only shows who is signed in)
test/         one test file per module, a real SQLite database for the API, the Python reference numbers
scripts/      e2e-local.mjs
wrangler.jsonc  the Worker configuration (names, D1 binding, Access settings)
```
