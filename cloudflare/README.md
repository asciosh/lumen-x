# Lumen-X · Cloudflare edition

A second implementation of Lumen-X that runs on the **free** Cloudflare plan: a Worker, a D1 database and
Cloudflare Access for the login. The full stack in the rest of the repo (.NET + Python + PostgreSQL) stays as it is.

**Status: work in progress.** What exists today is the forecasting engine, in TypeScript, with tests.
The Worker (API, database, login, dashboard) comes next.

## Why a second implementation

The free Cloudflare plan cannot run ASP.NET Core, Python or PostgreSQL. It can run a Worker (JavaScript/TypeScript,
about 10 ms of CPU per request on the free plan), a D1 database (SQLite) and, in front of them, Cloudflare Access
(login by email code or Google, free up to 50 users, one click on a `workers.dev` address, no domain needed).
So the engine had to be rewritten in TypeScript.

## What is the same and what is not

| | Full stack (.NET + Python) | Cloudflare edition |
| --- | --- | --- |
| Methods | weekly naive, ETS, LightGBM, and the average of ETS and LightGBM | weekly naive and ETS |
| Backtest | 3 consecutive windows, pooled errors | the same windows, the same rules |
| Interval | 80% band: forecast ± 1.2816 × backtest RMSE | the same |
| CSV import, reorder suggestion | yes | yes, same rules and same messages |

**Accuracy.** On the real Bread series of the demo (1684 days, 3 windows of 28 days), the error (RMSE) is:

| Method | RMSE |
| --- | --- |
| Weekly naive | 226.7 (identical in both implementations) |
| ETS, TypeScript | 183.5 |
| ETS, Python (statsmodels) | 183.2 |
| Average of ETS and LightGBM (full stack only) | 170.4 |

So the TypeScript ETS matches the Python one, but this edition lacks the average with LightGBM, which is about 8% better
on this series. It is still about 19% better than the naive method.

## Run the tests

```bash
cd cloudflare
npm install
npm test          # vitest
npm run typecheck # tsc
```

The forecast tests use the real series in `docs/data/sales.json` and compare with the output of the Python service.
One test also checks that a full request (backtest on three windows plus the forecast) stays well under the CPU
limit of the free Workers plan.

## Layout

```
src/engine/   csv.ts (import rules), series.ts (daily series, gaps filled), models.ts (naive, ETS),
              forecast.ts (backtest, choice of method, interval), reorder.ts (safety stock)
test/         one test file per module, plus the Python reference numbers
```
