# Lumen-X · Cloudflare edition

A second implementation of Lumen-X that runs on the **free** Cloudflare plan, with no credit card: a Worker, a D1 database
and a sign-in with GitHub. The full stack in the rest of the repo (.NET + Python + PostgreSQL) stays as it is.

**Status: work in progress.** Done: the forecasting engine and the Worker (sign-in with GitHub, database, CSV import, forecast,
reorder), tested in Node and in the real Workers runtime. Next: the dashboard, the explanations and the questions. Nothing is deployed yet.

## Why a second implementation

The free Cloudflare plan cannot run ASP.NET Core, Python or PostgreSQL. It can run a Worker (JavaScript/TypeScript,
about 10 ms of CPU per request on the free plan) and a D1 database (SQLite). So the engine had to be rewritten in TypeScript.

The login is done by the Worker itself, with GitHub. Cloudflare has its own login service (Access, part of Zero Trust), but
turning it on asks for a payment method, even on the free plan, and this edition is meant to need none.

## How it works

```
browser ──► Worker ──► D1
              │  └─ /auth/*  sign-in with GitHub (OAuth)
              └─ static files of the dashboard (public/), served as they are
```

- **Sign-in.** `/auth/login` sends the user to GitHub; GitHub sends him back to `/auth/callback` with a code, which the Worker
  exchanges for who he is (only the public profile is asked: no permissions). If his GitHub username is on the owner's list,
  the Worker gives him a signed session cookie (HttpOnly, Secure, SameSite=Lax, 14 days). Nothing is stored on the server.
  A random `state`, tied to the browser that started the sign-in, stops a forged sign-in.
- **The list is checked on every request**, not only at sign-in: removing a name locks that person out at once. Changing
  `SESSION_SECRET` signs everybody out.
- **Closed by default.** While a secret is missing, every request to the API and to the login is refused. Preview URLs are off,
  because they would be public. The static page is public, but it holds no data: it only asks the API who you are.
- **Every user sees only his own data.** Data belongs to the GitHub numeric id (not the username, which can change or be
  taken by somebody else), and every query goes through it. Another user's product answers *404*, never *403*, so its
  existence is not revealed.
- **Cross-site requests are refused** (a POST whose `Origin` is not the site's own), so a page on another site cannot act with the user's session.

## The API

All answers are JSON; errors have the same shape as the .NET backend (`title`, `status`, `detail`).

| Route | What it does |
| --- | --- |
| `GET /api/me` | the GitHub username of the user |
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

## Setup on Cloudflare

The Worker needs four **secrets** (Worker → Settings → Variables and secrets → type *Secret*; secrets survive every deploy and
never reach the repo): `SESSION_SECRET` (random text, at least 32 characters), `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
(from a GitHub OAuth app whose callback URL is `https://<your worker address>/auth/callback`) and `ALLOWED_GITHUB_USERS`
(for example `alice, bob`). The database schema is in `migrations/0001_init.sql`; paste it in the D1 console.

## Run it

```bash
cd cloudflare
npm install
npm test          # 181 tests (vitest): engine, sessions, GitHub sign-in, API on a real SQLite database
npm run typecheck # tsc
npm run e2e       # the Worker in the real Workers runtime (workerd), locally, with the real Bread series
```

`npm run e2e` starts the Worker with a local D1 database; a small local server plays the role of GitHub, so the whole sign-in runs
for real. It checks: sign-in and cookie flags, a user that is not on the list, a forged sign-in, a tampered cookie, isolation
between users, CSV import of 1684 days, forecast, reorder, cross-site POST and sign-out. Every run starts from a new temporary
database. Nothing leaves your machine.

## Layout

```
src/engine/   csv.ts (import rules), series.ts (daily series, gaps filled), models.ts (naive, ETS),
              forecast.ts (backtest, choice of method, interval), reorder.ts (safety stock)
src/worker/   index.ts (entry point), login.ts (GitHub sign-in), session.ts (signed cookie), auth.ts (who is calling),
              allowlist.ts, api.ts (routes), db.ts (queries), limits.ts, http.ts
migrations/   0001_init.sql (the D1 schema)
public/       the dashboard (a placeholder for now: sign in, sign out, and who you are)
test/         one test file per module, a real SQLite database for the API, the Python reference numbers
scripts/      e2e-local.mjs
wrangler.jsonc  the Worker configuration (names, D1 binding, which routes run the Worker first)
```
