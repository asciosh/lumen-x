# Lumen-X · Cloudflare edition

A second implementation of Lumen-X that runs on the **free** Cloudflare plan, with no credit card: a Worker, a D1 database
and a sign-in with GitHub. The full stack in the rest of the repo (.NET + Python + PostgreSQL) stays as it is.

**Status: private beta.** Done: the forecasting engine, the Worker (sign-in with GitHub, database, CSV import, forecast, reorder,
plain-language explanations, questions about the data, an optional AI rewrite of the explanation) and the dashboard (English and Italian): products, CSV upload with the list of
rejected rows, an automatic forecast after every upload, and a product page that starts with **three answers in plain words**: how much
to order (highlighted: a number, with an optional "how many do you already have?"), how much will be sold, and how much to trust it
("very reliable" ... "not reliable"). Under them the chart and the questions about the data. Everything technical (the method, the errors
MAE and RMSE, the day-by-day tables, the full explanation and its optional AI rewrite, the downloads and the sales table) is folded under
"Details for experts". A one-click example product, a privacy notice and a "delete all my data" button (inside the privacy notice) complete
it. It is invite only, so there is no public address.

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
| `GET /api/products/:id/forecast/explanation?lang=it\|en` | the explanation of the latest forecast, written by the code (no AI) |
| `GET /api/products/:id/reorder?leadTimeDays=7&reviewDays=7&serviceLevel=95&onHand=` | the reorder suggestion (safety stock) |
| `POST /api/products/:id/forecast/explanation/ai?lang=it\|en` | "Rewrite with AI": the same explanation rewritten by an AI provider from the numbers only; falls back to the text written by the code, with a note |
| `GET /api/products/:id/summary?leadTimeDays=&reviewDays=&serviceLevel=&onHand=` | the three answers in one: what will be sold, how much to order (same parameters as `/reorder`), and a verdict on the trust (`high`, `medium`, `low`, `very_low`) |
| `GET /api/ai` | whether the AI is on, with which providers, and how many rewrites the user has left today |
| `POST /api/products/:id/ask` | `{ "question": "...", "language": "it" }`: a question about the data (the language is optional), answered by rules |
| `DELETE /api/me/data` | deletes every product of the user, with its sales and forecasts |

**Limits per user** (so a runaway upload cannot use up the free plan): 10 products, 1 MB and 5,000 rows per upload,
3,650 days of sales per product; only the last 5 forecasts of a product are kept.

## What is the same and what is not

| | Full stack (.NET + Python) | Cloudflare edition |
| --- | --- | --- |
| Methods | weekly naive, ETS, LightGBM, and the average of ETS and LightGBM | weekly naive and ETS |
| Backtest | 3 consecutive windows, pooled errors | the same windows, the same rules |
| Interval | 80% band: forecast ± 1.2816 × backtest RMSE | the same |
| CSV import, reorder suggestion | yes | yes, same rules and same messages |
| Explanations | rewritten by Gemini if a key is set, otherwise written by the code | written by the code (the same text as the full stack without Gemini); optionally rewritten by a free AI provider (Workers AI, Gemini, Groq, OpenRouter) |
| Questions about the data | 8 kinds of questions, answered by rules | the same 8 kinds, the same answers |

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

## The trust verdict

The product page says in words how much to trust the forecast. It is **indicative, not a guarantee**: the average daily error of the check on
the past is compared with the size of the forecast (under 10% "very reliable", under 20% "fairly reliable", under 35% "not very reliable",
above that "not reliable"). A forecast that does no better than repeating last week, or a series with 20% or more of the days at zero, is
never better than "not very reliable"; with half of the days at zero it is "not reliable". The thresholds are in `src/engine/summary.ts`
and are my own choice, tested at their edges, not a standard.

## AI rewrite (optional)

A button "Rewrite with AI" next to the explanation asks an AI provider to write the explanation in nicer prose. Nothing is automatic.

- **Only numbers go out.** The provider receives the summary figures computed by the code (totals, averages, errors, dates, the method) as
  JSON. Never the sales rows and **never the product name**: the AI is told to call the product `[[PRODUCT]]` and the real name is put back
  here, after the answer. (A product name is text typed by a user: keeping it out also means it cannot be used to steer the AI.)
- **The figures are checked.** Every number in the AI text must be among the facts (same rule as the .NET app, `NumberGuard`): a text with
  invented figures is discarded and the user gets the text written by the code, with a note. The check protects the numbers, not the claims.
- **A small router, not a pool of accounts.** The providers are tried in order (`workers-ai`, `gemini`, `groq`, `openrouter`, or the order
  in `LLM_ORDER`); one that fails is paused (10 minutes after a rate limit, 1 hour for a wrong key or model, 2 minutes after other errors; the
  pause is kept in the database) and the next one is used. Each provider has a budget of 200 calls a day. At most three providers are tried for
  one request. It uses **one key per provider, yours**: it does not rotate several accounts of the same provider to multiply a free quota
  (that is usually against the terms and makes everything fragile).
- **Limits.** 20 rewrites per user per day (UTC; the number is `aiRewritesPerUserPerDay` in `src/worker/limits.ts`, and a test keeps the privacy notice in step with it); "Delete all my data" does not reset the count. A provider that did answer counts, even if
  its text was discarded; a provider that did not answer does not.
- **Off by default.** A provider is used only if its settings exist. With none, the button does not appear.

Data policies of the free tiers, as stated by comparisons dated October 2026 (check the provider's own terms before you rely on them):
Cloudflare Workers AI and Groq say they do not train on API data; Google's free Gemini tier may use the content to improve its products
(the sources say not for the EEA, Switzerland and the UK); Mistral's free mode may train unless you opt out; for OpenRouter's free models it
depends on who serves the model. Since only anonymous numbers are sent, this matters less, but the privacy notice of the dashboard names
the providers that are switched on.

### Setup

1. In the D1 console, run `migrations/0002_ai.sql` (two small tables: the daily counters and the state of the providers).
2. For Workers AI (no key), add to `wrangler.jsonc`: `"ai": { "binding": "AI" }`, and set the variable `WORKERS_AI_MODEL` to a model id from the
   Workers AI catalog (for example a small "instruct" model; the catalog changes, so pick one that is listed today).
3. For the others, add the secrets `GEMINI_API_KEY` and `GEMINI_MODEL`, `GROQ_API_KEY` and `GROQ_MODEL`, `OPENROUTER_API_KEY` and
   `OPENROUTER_MODEL` (a provider needs both its key and its model). Secrets: Worker, Settings, Variables and secrets, type *Secret*.

`npm run e2e` runs the whole thing in the real Workers runtime with a stand-in provider (it strips the Workers AI binding, which only works
against the real Cloudflare). The unit tests use fake providers; **a call to a real provider has not been tested from here.**

## Privacy

The dashboard shows a privacy notice before and after the sign-in. In short: the app stores the products, daily sales and forecasts of
each account, the numeric GitHub id (not the email) and a small daily counter of AI rewrites; there is no analytics; AI providers receive
only anonymous summary numbers, and only when the user presses "Rewrite with AI"; the owner of the installation runs the database and could
technically read it; every product can be deleted, and the button "Delete all my data" removes everything of the account. If you change
where the data lives (for example the D1 location) or the AI providers, check the text in `public/app.js`.

## Run it

```bash
cd cloudflare
npm install
npm test          # 456 tests (vitest): engine, sessions, GitHub sign-in, API on a real SQLite database, dashboard files
npm run typecheck # tsc
npm run e2e       # the Worker in the real Workers runtime (workerd), locally, with the real Bread series
```

`npm run e2e` starts the Worker with a local D1 database; a small local server plays the role of GitHub, so the whole sign-in runs
for real. It checks: sign-in and cookie flags, a user that is not on the list, a forged sign-in, a tampered cookie, isolation
between users, CSV import of 1684 days, forecast, reorder, cross-site POST and sign-out. Every run starts from a new temporary
database. Nothing leaves your machine.

`test/reference.test.ts` compares the answers to the questions (16 of them, in Italian and English), the facts of the explanation and
the reorder suggestions with what the real .NET app computed on the same Bread series (`docs/data/*.json`, exported from the running
backend): the texts are identical character by character.

## Layout

```
src/engine/   csv.ts (import rules), series.ts (daily series, gaps filled), models.ts (naive, ETS),
              forecast.ts (backtest, choice of method, interval), reorder.ts (safety stock),
              explain.ts (facts and the written explanation, Italian and English),
              chat/ (the questions about the data: question text, intent, period, answers)
src/worker/   index.ts (entry point), login.ts (GitHub sign-in), session.ts (signed cookie), auth.ts (who is calling),
              allowlist.ts, api.ts (routes), db.ts (queries), limits.ts, http.ts,
              llm/ (the optional AI rewrite: prompt, providers, router)
migrations/   0001_init.sql (the D1 schema), 0002_ai.sql (the AI counters)
public/       the dashboard: index.html, app.js (no framework), export.js (the CSV files), app.css and fonts shared with the demo, sample-sales.csv
test/         one test file per module, a real SQLite database for the API, the Python reference numbers
scripts/      e2e-local.mjs
wrangler.jsonc  the Worker configuration (names, D1 binding, which routes run the Worker first)
```
