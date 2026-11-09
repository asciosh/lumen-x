# Lumen-X · Backend (.NET)

ASP.NET Core minimal API that manages products and sales, calls the Python forecasting service
(`services/forecasting`) and stores the results in PostgreSQL. It is the only component that knows the
database, the forecasting service and Gemini: the dashboard talks to the backend and nothing else.

```
CSV / API  ->  .NET backend (this folder)  ->  Python service (FastAPI)
                    |
                PostgreSQL
```

Tests run automatically on every push (see `.github/workflows/ci.yml`).

## Structure

```
backend/
  Directory.Build.props        framework + package version (single place)
  Dockerfile
  scripts/generate_sample_csv.py
  src/LumenX.Api/              API (Domain, Data, Sales, Forecasting, Explanations, Reorder, Chat, Endpoints, Contracts)
  tests/LumenX.Api.Tests/      xUnit + WebApplicationFactory + InMemory DB + fake clients
```

## .NET version

The default is **.NET 10**. Check your SDK with `dotnet --list-sdks`.

To change version, edit `PackagesMajor` in `Directory.Build.props` and, for Docker, set `DOTNET_MAJOR`
(for example in a `.env` file in the repo root). The Dockerfiles force the version also in `restore`/`publish`,
so an image cannot be built with a version different from the one in the `sdk:`/`aspnet:` tags.
Keep it aligned with `dashboard/`.

Microsoft/Npgsql packages use the floating version `<major>.0.*` (latest available patch).

## Build and test

```bash
cd backend
dotnet build src/LumenX.Api
dotnet test tests/LumenX.Api.Tests
```

The tests use neither Postgres nor the Python service. Note: the InMemory provider does **not** enforce the
unique index `(product, date)`; the upsert is guaranteed by the code and tested, while the real constraint
exists only on Postgres.

## Run with Docker Compose (from the repo root)

```bash
docker compose up --build
```

Services: `db` (Postgres 16, port bound to 127.0.0.1 only), `forecasting` (8000), `backend` (8080) and
`dashboard` (8081). Development password: `lumenx_dev_password`; to change it:
`POSTGRES_PASSWORD=... docker compose up --build` (if the `lumenx_pgdata` volume already exists, the previous
password stays in the DB: `docker compose down -v`).

## Run locally without Docker

Postgres and the Python service must already be running:

```bash
cd backend/src/LumenX.Api
export ConnectionStrings__Default="Host=localhost;Port=5432;Database=lumenx;Username=lumenx;Password=<your password>"
export Forecasting__BaseUrl="http://localhost:8000"
ASPNETCORE_URLS=http://localhost:8080 dotnet run
```

## Configuration

| Key (environment variable)    | Default                    | Notes                                                    |
|-------------------------------|----------------------------|----------------------------------------------------------|
| `ConnectionStrings__Default`  | localhost, no password     | the password comes from the environment                  |
| `Forecasting__BaseUrl`        | `http://localhost:8000`    |                                                          |
| `Forecasting__TimeoutSeconds` | `120`                      |                                                          |
| `Database__UseMigrations`     | `false`                    | `false` = `EnsureCreated`, `true` = `Migrate`            |
| `Gemini__ApiKey`              | empty                      | optional: without it explanations use the template text  |
| `Gemini__Model`               | `gemini-3.5-flash`         | compose passes `GEMINI_MODEL` (default in compose file)  |
| `Gemini__TimeoutSeconds`      | `20`                       | compose passes `GEMINI_TIMEOUT_SECONDS` (default 60)     |

## Endpoints

| Method | Path                                      | Description                                                    |
|--------|-------------------------------------------|----------------------------------------------------------------|
| GET    | `/health`                                 | `{"status":"ok"}`                                              |
| POST   | `/products`                               | create a product `{"name": "...", "sku": "..."}` -> 201        |
| GET    | `/products`                               | list products                                                  |
| GET    | `/products/{id}`                          | product detail                                                 |
| POST   | `/products/{id}/sales/import`             | CSV import (multipart, field `file`)                           |
| GET    | `/products/{id}/sales?from=&to=`          | sales, optional filter (dates `yyyy-MM-dd`, bounds included)   |
| POST   | `/products/{id}/forecast`                 | compute and save a forecast -> 201                             |
| GET    | `/products/{id}/forecast`                 | latest saved forecast                                          |
| GET    | `/products/{id}/forecast/explanation`     | plain-language explanation of the latest forecast (it / en)    |
| GET    | `/products/{id}/reorder`                  | reorder suggestion from the latest forecast                    |
| POST   | `/products/{id}/ask`                      | questions about the data, answered without AI (it / en)        |

JSON is **camelCase** (ASP.NET convention; the Python service speaks snake_case but the client translates it).
Error messages are in English and follow the standard ProblemDetails shape (`title`, `detail`, `status`).

### CSV import

- Required columns (header, case-insensitive): `date`, `quantity`. Other columns are ignored.
- Separator `,` or `;` (decided by the header).
- Dates: `yyyy-MM-dd` or `dd/MM/yyyy`.
- Quantity: dot or comma as decimal (`12.5`, `12,5`). With a `,` separator, decimals written with a comma must be
  quoted (`"12,5"`); a row with extra columns is rejected, not misread.
  `1.234,56` and `1,234.56` are both 1234.56; a single dot is always a decimal (`1.234` = 1.234).
- Negative quantities are rejected.
- Wrong rows are reported in `errors` (with the line number, max 100) without blocking the valid ones.
- Upsert by `(product, date)`; if the same date appears twice in the file, the last row wins.
- Response: `totalRows, validRows, inserted, updated, duplicatesInFile, rejected, errors, errorsTruncated`.

### Forecast

Optional JSON body: `{"horizon": 1..90, "method": "auto"|"naive"|"ets"|"lightgbm"}`.
**Always send at least `{}`** with `Content-Type: application/json`.

| Situation                                              | Response |
|--------------------------------------------------------|----------|
| unknown product                                        | 404      |
| invalid `horizon`/`method`                             | 422      |
| fewer than 42 days of sales (service NOT called)       | 422      |
| the Python service answers 422                         | 422      |
| service unreachable / timeout                          | 503      |
| the service answers with other errors (e.g. 500)       | 502      |

## curl examples

```bash
BASE=http://localhost:8080

curl $BASE/health

# create a product
curl -X POST $BASE/products -H "Content-Type: application/json" \
     -d '{"name":"Bread","sku":"BREAD-01"}'

# generate a sample CSV (120 days) and import it (product id 1)
python3 backend/scripts/generate_sample_csv.py --out sample_sales.csv
curl -X POST $BASE/products/1/sales/import -F "file=@sample_sales.csv"

# Italian style, with 2 wrong rows
python3 backend/scripts/generate_sample_csv.py --style italian --with-errors --out sample_it.csv
curl -X POST $BASE/products/1/sales/import -F "file=@sample_it.csv"

# read the sales (optional filter)
curl "$BASE/products/1/sales?from=2025-02-01&to=2025-02-10"

# forecast (default: horizon 28, method auto)
curl -X POST $BASE/products/1/forecast -H "Content-Type: application/json" -d '{}'
curl -X POST $BASE/products/1/forecast -H "Content-Type: application/json" \
     -d '{"horizon":14,"method":"ets"}'

# latest saved forecast
curl $BASE/products/1/forecast
```

## Forecast explanations (Italian / English)

`GET /products/{id}/forecast/explanation?lang=it|en&useAi=true|false` explains the latest forecast of the product.

1. The code computes the **facts** (change versus recent history, strongest day, interval width, backtest error
   versus the naive method, missing days).
2. With `useAi=false` the text is built from sentence templates: free, offline, no AI.
3. With `useAi=true` (default) and a configured key, **Gemini rewrites** the same facts in a more natural way.
   Only aggregated facts go to the AI, not the raw sales, and it is forbidden to do new calculations.
4. If the key is missing or Gemini does not answer (limits, network), the response contains the template text and
   `note` is `ai_not_configured` or `ai_unavailable`. If Gemini's text contains figures that are not among the
   computed facts, it is discarded (`ai_rejected`): the AI tells the numbers, it does not invent them. If at least
   20% of the days in the history are zero, the explanation warns that the forecast is not very reliable.

```bash
BASE=http://localhost:8080
curl "$BASE/products/1/forecast/explanation?lang=it&useAi=false"
curl "$BASE/products/1/forecast/explanation?lang=en"
```

### Configure Gemini (optional)

The key must never be written in the code or in `appsettings.json`: it comes from the `GEMINI_API_KEY`
environment variable (in a Codespace: *Settings → Codespaces → Secrets*, then restart the Codespace).
`docker-compose.yml` passes it to the backend. The model is changed with `GEMINI_MODEL`: available names
change over time, check them in Google AI Studio.

Note: on the free plan Google may use the submitted content to improve its products, and request limits are low.
It is fine for test data; do not use it with real customer data.

## Reorder suggestions

`GET /products/{id}/reorder?leadTimeDays=7&reviewDays=7&serviceLevel=95&onHand=300` answers the question
"how much should I order?" from the latest saved forecast (all parameters are optional; the values shown are
the defaults, except `onHand`).

- `leadTimeDays`: supplier lead time in days (1-60)
- `reviewDays`: days between one order and the next (0-60)
- `serviceLevel`: 90, 95, 98 or 99 (probability of not running out of stock during the period)
- `onHand`: current stock; if missing, the response has no `suggestedOrder`

The calculation, with P = `leadTimeDays` + `reviewDays`:

| Item | Formula |
| --- | --- |
| Demand in the period | sum of the forecasts of the first P days |
| Safety stock | z × daily backtest RMSE × √P |
| Maximum level | demand + safety stock |
| Suggested order | maximum level − `onHand`, never negative, rounded up |

with z = 1.2816 / 1.6449 / 2.0537 / 2.3263 for 90 / 95 / 98 / 99%.

Limits: the square root of P assumes independent errors from one day to the next, so if sales suddenly change
level the safety stock may turn out too low. If the period exceeds the forecast horizon the response is 422
(recompute with a longer horizon). If at least 20% of the days in the history are zero, the response contains
the `intermittent` warning.

```bash
curl "http://localhost:8080/products/1/reorder?leadTimeDays=7&reviewDays=7&serviceLevel=95&onHand=300"
```

## Questions about the data (no AI)

`POST /products/{id}/ask` answers questions, in Italian or English, about the sales and the forecast of a product.

```bash
curl -X POST http://localhost:8080/products/1/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How much did I sell in the last 30 days?"}'
```

Body: `question` (3 to 300 characters) and `language` (`it` or `en`, optional: if missing it is detected from the question).
Response: `question`, `language`, `intent`, `understood`, `answer` and `suggestions` (example questions, filled only
when the question was not understood).

**How it works.** There is no AI and no invented number: the question is mapped to one of the following by keywords,
and the answer is computed by the code on the data and written with fixed phrases.

| `intent` | Example | What it computes |
| --- | --- | --- |
| `sales_total` | "How much did I sell in the last 30 days?" | total and daily average in a period |
| `compare_periods` | "How are sales doing compared to last month?" | recent period against the previous one, with the change |
| `weekday_pattern` | "Which day of the week sells best?" | strongest and weakest day over the last 12 weeks |
| `peak_day` | "What was my record day?" | best and worst day of the period |
| `forecast_total` | "How much will I sell in the next 2 weeks?" | sum of the forecasts of the requested days |
| `reorder` | "What should I order?" | reorder level with default times (7 + 7 days, 95% service) |
| `reliability` | "How reliable is the forecast?" | method, average error, likely range, comparison with the naive |
| `summary` | "Explain the forecast" | the rule-based explanation of the forecast |
| `unknown` | anything else | says what can be asked, with examples |

Italian questions work the same way (for example "Quanto ho venduto negli ultimi 30 giorni?").

**Periods.** They always refer to the last day of data, not to today: "last 30 days" are the 30 days ending there;
a week is 7 days, a month 30, a year 365. "In March" is the calendar month (without a year, the most recent one not
after the last day of data); "in March 2025" uses the given year. Without a period: 30 days for sales, 90 for the
record day, 28 for comparisons.

**Limits.** Recognition is keyword-based: a question worded very differently from the examples may not be understood
(and the answer says so, instead of guessing). The system only has quantities, not prices: if you ask about revenue,
income or earnings it answers with units sold and says so at the start of the answer. It cannot compare two named
months, filter by weekday ("Saturday sales") or choose the reorder period: use the Reorder box for that.

If the question is not recognized, the response has `understood: false` and `suggestions` contains eight example
questions that are sure to work.

## EF migrations (optional, to do in the Codespace)

At startup the DB is created with `EnsureCreated`. When you want to move to migrations:

```bash
dotnet tool install --global dotnet-ef --version "10.*"
cd backend
dotnet ef migrations add InitialCreate --project src/LumenX.Api --output-dir Data/Migrations
```

Then set `Database__UseMigrations=true` (compose: `DB_USE_MIGRATIONS=true`).
A DB created with `EnsureCreated` **cannot** be migrated afterwards: recreate it
(`docker compose down -v`, which deletes the data) or start from an empty DB.

## Known limits

- No authentication.
- No Swagger page for now (it avoids dependencies tied to the .NET version).
- The `interval` field of the Python response is stored as raw JSON (its type is not assumed).
