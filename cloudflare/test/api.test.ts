import { beforeEach, describe, expect, it } from "vitest";
import { handle } from "../src/worker/api";
import type { Db } from "../src/worker/db";
import { LIMITS } from "../src/worker/limits";
import { createTestDb } from "./helpers/sqlite-d1";

const NOW = new Date("2026-11-10T10:00:00.000Z");

let db: Db;

interface Who {
  owner: string;
  login: string;
}
const ALICE: Who = { owner: "github:1", login: "alice" };
const BOB: Who = { owner: "github:2", login: "bob" };

/** Calls the API as a given (already signed-in) user. */
async function call(who: Who, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json", ...headers };
  }
  const res = await handle(new Request(`https://lumenx.test${path}`, init), { db, ...who, now: () => NOW });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text.length > 0 ? JSON.parse(text) : null };
}

const alice = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => call(ALICE, method, path, body, headers);
const bob = (method: string, path: string, body?: unknown) => call(BOB, method, path, body);

function csvForm(text: string, field = "file", filename = "sales.csv"): FormData {
  const form = new FormData();
  form.set(field, new File([text], filename, { type: "text/csv" }));
  return form;
}

/** A weekly pattern: `n` days from 2025-01-01. */
function weeklyCsv(n: number, base = 100): string {
  const lines = ["date,quantity"];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    lines.push(`${d},${base + 10 * (i % 7)}`);
  }
  return lines.join("\n");
}

/** A weekly pattern with some noise, like real sales: the forecast then has a real error. */
function noisyCsv(n: number): string {
  const lines = ["date,quantity"];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    lines.push(`${d},${100 + 10 * (i % 7) + ((i * 37) % 11 - 5) * 3}`);
  }
  return lines.join("\n");
}

async function newProduct(owner: typeof alice, name = "Bread"): Promise<number> {
  const r = await owner("POST", "/api/products", { name });
  expect(r.status).toBe(201);
  return r.body.id;
}

beforeEach(() => {
  db = createTestDb();
});

describe("/api/me", () => {
  it("returns the GitHub username of the user", async () => {
    expect((await alice("GET", "/api/me")).body).toEqual({ login: "alice" });
  });
});

describe("products", () => {
  it("creates, lists and reads a product", async () => {
    const created = await alice("POST", "/api/products", { name: "  Bread ", sku: "B-1" });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: 1, name: "Bread", sku: "B-1", createdAtUtc: NOW.toISOString() });
    expect((await alice("GET", "/api/products")).body).toEqual([created.body]);
    expect((await alice("GET", "/api/products/1")).body).toEqual(created.body);
  });

  it("lists the products in alphabetical order, ignoring case", async () => {
    for (const name of ["pasta", "Bread", "apples"]) await newProduct(alice, name);
    expect((await alice("GET", "/api/products")).body.map((p: { name: string }) => p.name)).toEqual(["apples", "Bread", "pasta"]);
  });

  it("refuses a duplicate name (case-insensitive) with 409, but another user can use it", async () => {
    await newProduct(alice, "Bread");
    const again = await alice("POST", "/api/products", { name: "BREAD" });
    expect(again.status).toBe(409);
    expect(again.body.detail).toBe("A product named 'BREAD' already exists.");
    expect((await bob("POST", "/api/products", { name: "Bread" })).status).toBe(201);
  });

  it.each([
    [{}, "The product needs a name."],
    [{ name: "   " }, "The product needs a name."],
    [{ name: 5 }, "The product needs a name."],
    [{ name: "x".repeat(101) }, "The name can have at most 100 characters."],
    [{ name: "ok", sku: "s".repeat(51) }, "The SKU can have at most 50 characters."],
  ])("rejects %j", async (body, detail) => {
    const r = await alice("POST", "/api/products", body);
    expect(r.status).toBe(422);
    expect(r.body.detail).toBe(detail);
  });

  it("rejects a body that is not a JSON object", async () => {
    expect((await alice("POST", "/api/products", [1, 2])).status).toBe(400);
    const res = await handle(new Request("https://lumenx.test/api/products", { method: "POST", body: "{oops" }), { db, ...ALICE, now: () => NOW });
    expect(res.status).toBe(400);
  });

  it("limits the number of products per user", async () => {
    for (let i = 0; i < LIMITS.maxProductsPerUser; i++) await newProduct(alice, `P${i}`);
    const r = await alice("POST", "/api/products", { name: "one too many" });
    expect(r.status).toBe(422);
    expect(r.body.detail).toContain("at most 10 products");
    expect((await bob("POST", "/api/products", { name: "mine" })).status).toBe(201);
  });

  it("deletes a product with its sales and forecasts", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(60)));
    await alice("POST", `/api/products/${id}/forecast`, {});
    expect((await alice("DELETE", `/api/products/${id}`)).status).toBe(204);
    expect((await alice("GET", `/api/products/${id}`)).status).toBe(404);
    const left = await db.prepare("SELECT (SELECT COUNT(*) FROM sales) AS s, (SELECT COUNT(*) FROM forecast_runs) AS f").first<{ s: number; f: number }>();
    expect(left).toEqual({ s: 0, f: 0 });
  });
});

describe("every user sees only his own data", () => {
  it("answers 404 (not 403) for the product of somebody else, on every route", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(60)));
    await alice("POST", `/api/products/${id}/forecast`, {});

    expect((await bob("GET", "/api/products")).body).toEqual([]);
    for (const [method, path, body] of [
      ["GET", `/api/products/${id}`],
      ["DELETE", `/api/products/${id}`],
      ["GET", `/api/products/${id}/sales`],
      ["POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(60))],
      ["GET", `/api/products/${id}/forecast`],
      ["POST", `/api/products/${id}/forecast`, {}],
      ["GET", `/api/products/${id}/reorder`],
    ] as const) {
      expect((await bob(method, path, body)).status, `${method} ${path}`).toBe(404);
    }

    // Alice's data is untouched by Bob's attempts.
    expect((await alice("GET", `/api/products/${id}/sales`)).body).toHaveLength(60);
    expect((await alice("GET", `/api/products/${id}`)).status).toBe(200);
  });
});

describe("sales import", () => {
  it("imports a file and reports what happened", async () => {
    const id = await newProduct(alice);
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(30)));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      dryRun: false, duplicates: "last", days: 30, firstDate: "2025-01-01", lastDate: "2025-01-30",
      preview: expect.any(Array),
      dateColumn: "date", quantityColumn: "quantity", headerless: false, delimiter: ",",
      totalRows: 30, validRows: 30, inserted: 30, updated: 0, duplicatesInFile: 0, rejected: 0, errors: [], errorsTruncated: false,
    });
    expect(r.body.preview).toHaveLength(5);
    expect(r.body.preview[0]).toEqual({ date: "2025-01-01", quantity: 100 });
    const sales = (await alice("GET", `/api/products/${id}/sales`)).body;
    expect(sales).toHaveLength(30);
    expect(sales[0]).toEqual({ date: "2025-01-01", quantity: 100 });
  });

  it("importing the same file again updates and does not duplicate", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(30)));
    const again = await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(40, 200)));
    expect(again.body).toMatchObject({ inserted: 10, updated: 30 });
    const sales = (await alice("GET", `/api/products/${id}/sales`)).body;
    expect(sales).toHaveLength(40);
    expect(sales[0].quantity).toBe(200); // overwritten
  });

  it("a date twice in the file: the last row wins", async () => {
    const id = await newProduct(alice);
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm("date,quantity\n2025-01-01,1\n2025-01-02,2\n2025-01-01,9"));
    expect(r.body).toMatchObject({ validRows: 3, inserted: 2, duplicatesInFile: 1 });
    expect((await alice("GET", `/api/products/${id}/sales`)).body[0]).toEqual({ date: "2025-01-01", quantity: 9 });
  });

  it("keeps the good rows and lists the bad ones", async () => {
    const id = await newProduct(alice);
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm("date,quantity\n2025-01-01,5\nnope,3\n2025-01-03,-1\n2025-01-04,8"));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ totalRows: 4, validRows: 2, inserted: 2, rejected: 2, errorsTruncated: false });
    expect(r.body.errors.map((e: { line: number }) => e.line)).toEqual([3, 4]);
  });

  it("lists at most 100 errors and says so", async () => {
    const id = await newProduct(alice);
    const rows = ["date,quantity", "2025-01-01,1"];
    for (let i = 0; i < 150; i++) rows.push(`bad${i},1`);
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm(rows.join("\n")));
    expect(r.body.rejected).toBe(150);
    expect(r.body.errors).toHaveLength(100);
    expect(r.body.errorsTruncated).toBe(true);
  });

  it("refuses a file without valid rows, and says why", async () => {
    const id = await newProduct(alice);
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm("date,quantity\nnope,1"));
    expect(r.status).toBe(422);
    expect(r.body.detail).toBe("No valid rows were found in the file.");
    expect(r.body.errors).toHaveLength(1);
  });

  it("refuses a file without the header, an empty file and a missing field", async () => {
    const id = await newProduct(alice);
    expect((await alice("POST", `/api/products/${id}/sales/import`, csvForm("day,amount\n1,2"))).body.detail).toBe("The header needs the 'date' and 'quantity' columns.");
    expect((await alice("POST", `/api/products/${id}/sales/import`, csvForm(""))).body.detail).toBe("The file is empty.");
    expect((await alice("POST", `/api/products/${id}/sales/import`, csvForm("date,quantity\n2025-01-01,1", "other"))).status).toBe(422);
  });

  it("refuses a body that is not a form", async () => {
    const id = await newProduct(alice);
    expect((await alice("POST", `/api/products/${id}/sales/import`, { a: 1 })).status).toBe(400);
  });

  it("refuses a file that is too big, before reading it", async () => {
    const id = await newProduct(alice);
    const big = "date,quantity\n" + "2025-01-01,1\n".repeat(90_000); // about 1.2 MB
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm(big));
    expect(r.status).toBe(413);
  });

  it("refuses too many rows at once", async () => {
    const id = await newProduct(alice);
    const rows = ["date,quantity"];
    for (let i = 0; i < LIMITS.maxRowsPerImport + 1; i++) rows.push(`2025-01-01,${i}`);
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm(rows.join("\n")));
    expect(r.status).toBe(422);
    expect(r.body.detail).toContain("at most 5000");
  });

  it("limits the days one product can hold", async () => {
    const id = await newProduct(alice);
    await db
      .prepare("WITH RECURSIVE d(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM d WHERE n < 3649) INSERT INTO sales (product_id, date, quantity) SELECT ?, date('2000-01-01', '+' || n || ' days'), 1 FROM d")
      .bind(id)
      .run();
    const same = await alice("POST", `/api/products/${id}/sales/import`, csvForm("date,quantity\n2000-01-05,7")); // updates: fine
    expect(same.status).toBe(200);
    const more = await alice("POST", `/api/products/${id}/sales/import`, csvForm("date,quantity\n2030-01-01,7"));
    expect(more.status).toBe(422);
    expect(more.body.detail).toBe("A product can hold at most 3650 days of sales.");
  });

  it("accepts an Italian-style file", async () => {
    const id = await newProduct(alice);
    const r = await alice("POST", `/api/products/${id}/sales/import`, csvForm("data;date;quantity\r\nx;01/01/2025;12,5\r\nx;02/01/2025;7\r\n".replace("data;", "label;")));
    expect(r.body).toMatchObject({ inserted: 2, rejected: 0 });
    expect((await alice("GET", `/api/products/${id}/sales`)).body[0].quantity).toBe(12.5);
  });

  it("filters the sales by date", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(30)));
    expect((await alice("GET", `/api/products/${id}/sales?from=2025-01-10&to=2025-01-12`)).body.map((s: { date: string }) => s.date)).toEqual(["2025-01-10", "2025-01-11", "2025-01-12"]);
    expect((await alice("GET", `/api/products/${id}/sales?from=yesterday`)).status).toBe(422);
  });
});

describe("forecast", () => {
  it("computes, saves and returns the forecast, in the shape of the full stack", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(200)));
    const r = await alice("POST", `/api/products/${id}/forecast`, { horizon: 14, method: "auto" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ id: 1, productId: id, createdAtUtc: NOW.toISOString(), methodRequested: "auto", horizon: 14, holdoutDays: 14, intervalLevel: 0.8 });
    expect(["naive", "ets"]).toContain(r.body.methodUsed);
    expect(Object.keys(r.body.backtest).sort()).toEqual(["ets", "naive"]);
    expect(r.body.forecast).toHaveLength(14);
    expect(r.body.forecast[0].date).toBe("2025-07-20"); // the day after the last of the 200 days
    expect(await alice("GET", `/api/products/${id}/forecast`)).toMatchObject({ status: 200, body: r.body });
  });

  it("defaults to 28 days and auto with an empty body", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(200)));
    const r = await alice("POST", `/api/products/${id}/forecast`);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ horizon: 28, methodRequested: "auto" });
  });

  it("says when there is too little data", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(30)));
    const r = await alice("POST", `/api/products/${id}/forecast`, {});
    expect(r.status).toBe(422);
    expect(r.body.detail).toBe("At least 42 days of sales are required: found 30.");
    expect((await alice("GET", `/api/products/${id}/forecast`)).status).toBe(404);
  });

  it.each([
    [{ horizon: 0 }, "horizon"],
    [{ horizon: 91 }, "horizon"],
    [{ horizon: 2.5 }, "horizon"],
    [{ horizon: "28" }, "horizon"],
    [{ method: "lightgbm" }, "Unknown method"],
    [{ method: 3 }, "Unknown method"],
  ])("rejects %j", async (body, fragment) => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(100)));
    const r = await alice("POST", `/api/products/${id}/forecast`, body);
    expect(r.status).toBe(422);
    expect(r.body.detail).toContain(fragment);
  });

  it("keeps only the latest runs of a product", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(100)));
    for (let i = 0; i < LIMITS.forecastRunsKept + 3; i++) await alice("POST", `/api/products/${id}/forecast`, { horizon: 7 });
    const count = await db.prepare("SELECT COUNT(*) AS n FROM forecast_runs").first<{ n: number }>();
    expect(count?.n).toBe(LIMITS.forecastRunsKept);
    expect((await alice("GET", `/api/products/${id}/forecast`)).body.id).toBe(LIMITS.forecastRunsKept + 3);
  });

  it("uses at most the last 1095 days", async () => {
    const id = await newProduct(alice);
    // 1300 days: the first 205 are not used.
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(1300)));
    const r = await alice("POST", `/api/products/${id}/forecast`, { horizon: 7 });
    expect(r.status).toBe(201);
    expect(r.body.forecast[0].date).toBe(new Date(Date.UTC(2025, 0, 1 + 1300)).toISOString().slice(0, 10));
  });
});

describe("reorder", () => {
  async function productWithForecast() {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(200)));
    await alice("POST", `/api/products/${id}/forecast`, { horizon: 28 });
    return id;
  }

  it("needs a forecast first", async () => {
    const id = await newProduct(alice);
    expect((await alice("GET", `/api/products/${id}/reorder`)).status).toBe(404);
  });

  it("computes the order-up-to level with the defaults (7 + 7 days, 95%)", async () => {
    const id = await productWithForecast();
    const r = await alice("GET", `/api/products/${id}/reorder`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ forecastRunId: 1, leadTimeDays: 7, reviewDays: 7, periodDays: 14, serviceLevelPercent: 95, zValue: 1.6449, onHand: null, suggestedOrder: null, warnings: [] });
    expect(r.body.orderUpToLevel).toBeCloseTo(r.body.demandInPeriod + r.body.safetyStock, 9);
  });

  it("suggests an order from the current stock", async () => {
    const id = await productWithForecast();
    const r = await alice("GET", `/api/products/${id}/reorder?onHand=500&leadTimeDays=3&reviewDays=4&serviceLevel=99`);
    expect(r.body.periodDays).toBe(7);
    expect(r.body.suggestedOrder).toBe(Math.ceil(Math.max(0, r.body.orderUpToLevel - 500)));
  });

  it("a higher service level means more safety stock", async () => {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(noisyCsv(200)));
    await alice("POST", `/api/products/${id}/forecast`, { horizon: 28 });
    const stock = async (level: number) => (await alice("GET", `/api/products/${id}/reorder?serviceLevel=${level}`)).body.safetyStock as number;
    const [s90, s95, s98, s99] = [await stock(90), await stock(95), await stock(98), await stock(99)];
    expect(s90).toBeGreaterThan(0);
    expect(s90).toBeLessThan(s95);
    expect(s95).toBeLessThan(s98);
    expect(s98).toBeLessThan(s99);
  });

  it("warns when the product is intermittent (20% of days or more at zero)", async () => {
    const id = await newProduct(alice);
    const lines = ["date,quantity"];
    for (let i = 0; i < 100; i++) lines.push(`${new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)},${i % 4 === 0 ? 0 : 5 + (i % 7)}`);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(lines.join("\n")));
    await alice("POST", `/api/products/${id}/forecast`, { horizon: 28 });
    expect((await alice("GET", `/api/products/${id}/reorder`)).body.warnings).toEqual(["intermittent"]);
  });

  it.each([
    ["leadTimeDays=0", "Lead time must be between 1 and 60 days."],
    ["serviceLevel=97", "The service level must be 90, 95, 98 or 99."],
    ["onHand=-3", "Current stock must be a number greater than or equal to zero."],
    ["onHand=abc", "Current stock must be a number greater than or equal to zero."],
    ["leadTimeDays=x", "leadTimeDays, reviewDays and serviceLevel must be whole numbers."],
    ["leadTimeDays=30&reviewDays=30", "The period to cover (60 days) exceeds the forecast horizon (28 days): recompute the forecast with a horizon of at least 60 days."],
  ])("rejects ?%s", async (query, detail) => {
    const id = await productWithForecast();
    const r = await alice("GET", `/api/products/${id}/reorder?${query}`);
    expect(r.status).toBe(422);
    expect(r.body.detail).toBe(detail);
  });
});

describe("protection", () => {
  it("refuses a cross-site POST (the Origin is not ours)", async () => {
    const r = await alice("POST", "/api/products", { name: "x" }, { origin: "https://evil.example" });
    expect(r.status).toBe(403);
    expect((await alice("GET", "/api/products")).body).toEqual([]);
  });

  it("accepts a POST from our own origin", async () => {
    expect((await alice("POST", "/api/products", { name: "x" }, { origin: "https://lumenx.test" })).status).toBe(201);
  });

  it("answers 405 with the allowed methods, and 404 for unknown routes", async () => {
    const id = await newProduct(alice);
    const r = await alice("PUT", `/api/products/${id}`);
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, DELETE");
    expect((await alice("GET", "/api/nothing")).status).toBe(404);
    expect((await alice("GET", `/api/products/${id}/whatever`)).status).toBe(404);
    expect((await alice("GET", "/api/products/abc")).status).toBe(404);
  });

  it("never lets the answers be cached", async () => {
    const r = await alice("GET", "/api/products");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("is not fooled by SQL in the data", async () => {
    const r = await alice("POST", "/api/products", { name: "x'); DROP TABLE products; --" });
    expect(r.status).toBe(201);
    expect((await alice("GET", "/api/products")).body).toHaveLength(1);
  });
});

describe("explanation", () => {
  async function productWithForecast(owner: typeof alice = alice, name = "Bread") {
    const id = await newProduct(owner, name);
    await owner("POST", `/api/products/${id}/sales/import`, csvForm(noisyCsv(200)));
    await owner("POST", `/api/products/${id}/forecast`, { horizon: 28 });
    return id;
  }

  it("is written by the code, in Italian by default and in English on request", async () => {
    const id = await productWithForecast();
    const it = await alice("GET", `/api/products/${id}/forecast/explanation`);
    expect(it.status).toBe(200);
    expect(it.body).toMatchObject({ forecastRunId: 1, language: "it", source: "template", note: null });
    expect(it.body.text).toContain("Per «Bread» prevedo circa");
    expect(it.body.text).toContain("28 giorni");
    expect(it.body.facts).toMatchObject({ productName: "Bread", historyDays: 200, horizon: 28 });

    const en = await alice("GET", `/api/products/${id}/forecast/explanation?lang=EN`);
    expect(en.body.language).toBe("en");
    expect(en.body.text).toContain("For “Bread” I forecast about");
  });

  it("the numbers in the text are the ones of the forecast", async () => {
    const id = await productWithForecast();
    const run = (await alice("GET", `/api/products/${id}/forecast`)).body;
    const total = run.forecast.reduce((s: number, p: { yhat: number }) => s + p.yhat, 0);
    const text = (await alice("GET", `/api/products/${id}/forecast/explanation?lang=en`)).body.text as string;
    expect(text).toContain(Math.round(total).toLocaleString("en-US"));
  });

  it("needs a forecast, and a supported language", async () => {
    const id = await newProduct(alice);
    expect((await alice("GET", `/api/products/${id}/forecast/explanation`)).status).toBe(404);
    const withForecast = await productWithForecast(alice, "Pasta");
    const bad = await alice("GET", `/api/products/${withForecast}/forecast/explanation?lang=fr`);
    expect(bad.status).toBe(422);
    expect(bad.body.detail).toBe("'lang' must be 'it' or 'en'.");
  });

  it("is only for the owner, and only a GET", async () => {
    const id = await productWithForecast();
    expect((await bob("GET", `/api/products/${id}/forecast/explanation`)).status).toBe(404);
    expect((await alice("POST", `/api/products/${id}/forecast/explanation`)).status).toBe(405);
  });
});

describe("questions about the data", () => {
  async function productWithForecast(owner: typeof alice = alice, name = "Bread") {
    const id = await newProduct(owner, name);
    await owner("POST", `/api/products/${id}/sales/import`, csvForm(noisyCsv(200)));
    await owner("POST", `/api/products/${id}/forecast`, { horizon: 28 });
    return id;
  }
  const askIt = (id: number, question: unknown, language?: unknown, owner: typeof alice = alice) => owner("POST", `/api/products/${id}/ask`, { question, language });

  it("answers in the language of the request", async () => {
    const id = await productWithForecast();
    const it = await askIt(id, "Quanto ho venduto negli ultimi 30 giorni?", "it");
    expect(it.status).toBe(200);
    expect(it.body).toMatchObject({ question: "Quanto ho venduto negli ultimi 30 giorni?", language: "it", intent: "sales_total", understood: true, suggestions: [] });
    expect(it.body.answer).toMatch(/^Dal \d{2}\/\d{2}\/\d{4} al 19\/07\/2025 \(30 giorni\) hai venduto /);

    const en = await askIt(id, "How much did I sell in the last 30 days?", "en");
    expect(en.body.answer).toMatch(/^From \d+ \w{3} 2025 to 19 Jul 2025 \(30 days\) you sold /);
  });

  it("detects the language from the question when it is not given", async () => {
    const id = await productWithForecast();
    expect((await askIt(id, "What should I order?")).body.language).toBe("en");
    expect((await askIt(id, "Cosa conviene ordinare?")).body.language).toBe("it");
    expect((await askIt(id, "Cosa conviene ordinare?", "")).body.language).toBe("it");
    expect((await askIt(id, "What should I order?", null)).body.language).toBe("en");
  });

  it("uses the latest forecast for the reorder and reliability answers", async () => {
    const id = await productWithForecast();
    const reorder = (await askIt(id, "What should I order?", "en")).body;
    expect(reorder.intent).toBe("reorder");
    expect(reorder.answer).toContain("To cover the next 14 days");
    const reliable = (await askIt(id, "How reliable is the forecast?", "en")).body;
    expect(reliable.intent).toBe("reliability");
    expect(reliable.answer).toContain("The method used is");
  });

  it("says when there is no forecast or no sales yet", async () => {
    const empty = await newProduct(alice, "Empty");
    expect((await askIt(empty, "Quanto ho venduto?", "it")).body.answer).toContain("importa un CSV");
    const noForecast = await newProduct(alice, "NoForecast");
    await alice("POST", `/api/products/${noForecast}/sales/import`, csvForm(noisyCsv(60)));
    expect((await askIt(noForecast, "Cosa conviene ordinare?", "it")).body.answer).toBe("Per questo prodotto non c'è ancora un forecast: calcolalo nella sezione Previsione e poi chiedimi pure.");
  });

  it("an unknown question gets the list of examples", async () => {
    const id = await productWithForecast();
    const r = (await askIt(id, "Che tempo fa oggi?", "it")).body;
    expect(r).toMatchObject({ intent: "unknown", understood: false });
    expect(r.suggestions).toHaveLength(8);
    expect(r.suggestions[0]).toBe("Quanto ho venduto negli ultimi 30 giorni?");
  });

  it.each([
    [undefined, "Write a question of at least 3 and at most 300 characters."],
    ["", "Write a question of at least 3 and at most 300 characters."],
    ["  ab ", "Write a question of at least 3 and at most 300 characters."],
    [42, "Write a question of at least 3 and at most 300 characters."],
    ["x".repeat(301), "Write a question of at least 3 and at most 300 characters."],
  ])("rejects the question %j", async (question, detail) => {
    const id = await productWithForecast();
    const r = await askIt(id, question);
    expect(r.status).toBe(422);
    expect(r.body.detail).toBe(detail);
  });

  it("rejects an unsupported language and a body that is not an object", async () => {
    const id = await productWithForecast();
    const r = await askIt(id, "Cosa conviene ordinare?", "fr");
    expect(r.status).toBe(422);
    expect(r.body.detail).toBe("'language' must be 'it' or 'en'.");
    expect((await askIt(id, "Cosa conviene ordinare?", 7)).status).toBe(422);
    expect((await alice("POST", `/api/products/${id}/ask`, [1, 2])).status).toBe(400);
  });

  it("accepts a question of exactly 3 and of exactly 300 characters", async () => {
    const id = await productWithForecast();
    expect((await askIt(id, "abc")).status).toBe(200);
    expect((await askIt(id, "x".repeat(300))).status).toBe(200);
  });

  it("only talks about the data of its owner", async () => {
    const aliceId = await productWithForecast(alice, "Bread");
    const bobId = await newProduct(bob, "Bread");
    expect((await askIt(aliceId, "Quanto ho venduto?", "it", bob)).status).toBe(404);
    expect((await askIt(bobId, "Quanto ho venduto?", "it", bob)).body.answer).toContain("importa un CSV"); // not Alice's sales
    expect((await alice("GET", `/api/products/${aliceId}/ask`)).status).toBe(405);
  });
});

describe("delete all my data", () => {
  it("removes every product of the user, and only his", async () => {
    for (const name of ["Bread", "Pasta"]) {
      const id = await newProduct(alice, name);
      await alice("POST", `/api/products/${id}/sales/import`, csvForm(weeklyCsv(60)));
      await alice("POST", `/api/products/${id}/forecast`, {});
    }
    const bobId = await newProduct(bob, "Bread");
    await bob("POST", `/api/products/${bobId}/sales/import`, csvForm(weeklyCsv(60)));

    const r = await alice("DELETE", "/api/me/data");
    expect(r.status).toBe(204);
    expect((await alice("GET", "/api/products")).body).toEqual([]);
    expect((await bob("GET", "/api/products")).body).toHaveLength(1);
    expect((await bob("GET", `/api/products/${bobId}/sales`)).body).toHaveLength(60);
    const left = await db.prepare("SELECT (SELECT COUNT(*) FROM sales) AS s, (SELECT COUNT(*) FROM forecast_runs) AS f, (SELECT COUNT(*) FROM products) AS p").first<{ s: number; f: number; p: number }>();
    expect(left).toEqual({ s: 60, f: 0, p: 1 });
  });

  it("works with no data, only accepts DELETE, and refuses a cross-site request", async () => {
    expect((await alice("DELETE", "/api/me/data")).status).toBe(204);
    expect((await alice("GET", "/api/me/data")).status).toBe(405);
    expect((await alice("POST", "/api/me/data")).status).toBe(405);
    await newProduct(alice);
    expect((await alice("DELETE", "/api/me/data", undefined, { origin: "https://evil.example" })).status).toBe(403);
    expect((await alice("GET", "/api/products")).body).toHaveLength(1);
  });
});

describe("summary", () => {
  async function productWithForecast(horizon = 28, csv = noisyCsv(200)) {
    const id = await newProduct(alice);
    await alice("POST", `/api/products/${id}/sales/import`, csvForm(csv));
    await alice("POST", `/api/products/${id}/forecast`, { horizon });
    return id;
  }

  it("gives the three answers: what will be sold, how much to order, how much to trust it", async () => {
    const id = await productWithForecast();
    const r = await alice("GET", `/api/products/${id}/summary`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ forecastRunId: 1, orderError: null });
    expect(r.body.sales).toMatchObject({ days: 28, start: "2025-07-20", end: "2025-08-16" });
    const forecast = (await alice("GET", `/api/products/${id}/forecast`)).body.forecast as { yhat: number }[];
    expect(r.body.sales.total).toBeCloseTo(forecast.reduce((s, p) => s + p.yhat, 0), 6);
    expect(["high", "medium", "low", "very_low"]).toContain(r.body.trust.level);
    expect(r.body.order).toMatchObject({ periodDays: 14, leadTimeDays: 7, reviewDays: 7, serviceLevelPercent: 95, onHand: null, suggestedOrder: null });
  });

  it("the order is the same as the one of the reorder endpoint, for the same parameters", async () => {
    const id = await productWithForecast();
    const query = "leadTimeDays=3&reviewDays=4&serviceLevel=99&onHand=500";
    const summary = (await alice("GET", `/api/products/${id}/summary?${query}`)).body.order;
    const reorder = (await alice("GET", `/api/products/${id}/reorder?${query}`)).body;
    for (const key of ["periodDays", "demandInPeriod", "safetyStock", "orderUpToLevel", "onHand", "suggestedOrder", "serviceLevelPercent"]) {
      expect(summary[key], key).toBe(reorder[key]);
    }
  });

  it("a forecast shorter than the period is not an error: no order, and a reason", async () => {
    const id = await productWithForecast(10);
    const r = await alice("GET", `/api/products/${id}/summary`);
    expect(r.status).toBe(200);
    expect(r.body.order).toBeNull();
    expect(r.body.orderError).toContain("exceeds the forecast horizon (10 days)");
    expect(r.body.sales.days).toBe(10);
  });

  it("a stock that makes no sense gives a reason too, while the numbers that are not whole are refused", async () => {
    const id = await productWithForecast();
    expect((await alice("GET", `/api/products/${id}/summary?onHand=-3`)).body.orderError).toBe("Current stock must be a number greater than or equal to zero.");
    expect((await alice("GET", `/api/products/${id}/summary?onHand=abc`)).body.orderError).toBe("Current stock must be a number greater than or equal to zero.");
    const bad = await alice("GET", `/api/products/${id}/summary?serviceLevel=abc`);
    expect(bad.status).toBe(422);
    expect(bad.body.detail).toBe("leadTimeDays, reviewDays and serviceLevel must be whole numbers.");
  });

  it("a series with many days at zero is never more than 'low'", async () => {
    const lines = ["date,quantity"];
    for (let i = 0; i < 100; i++) lines.push(`${new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)},${i % 3 === 0 ? 0 : 5 + (i % 7)}`);
    const id = await productWithForecast(28, lines.join("\n"));
    const trust = (await alice("GET", `/api/products/${id}/summary`)).body.trust;
    expect(trust.intermittent).toBe(true);
    expect(["low", "very_low"]).toContain(trust.level);
  });

  it("needs a forecast, belongs to its owner and is only a GET", async () => {
    const empty = await newProduct(alice, "Empty");
    expect((await alice("GET", `/api/products/${empty}/summary`)).status).toBe(404);
    const id = await productWithForecast();
    expect((await bob("GET", `/api/products/${id}/summary`)).status).toBe(404);
    expect((await alice("POST", `/api/products/${id}/summary`)).status).toBe(405);
  });
});

describe("sales import: what the dashboard needs to be friendly", () => {
  const importPath = (id: number, query = "") => `/api/products/${id}/sales/import${query}`;
  const italian = "Data;Venduto\n01/03/2025;12,5\n02/03/2025;8\n03/03/2025;1.234,5\n";

  it("reads an Italian file (semicolon, 'Data' and 'Venduto', day first, decimal comma) and says what it understood", async () => {
    const id = await newProduct(alice);
    const r = await alice("POST", importPath(id), csvForm(italian));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dateColumn: "Data", quantityColumn: "Venduto", headerless: false, delimiter: ";", days: 3, firstDate: "2025-03-01", lastDate: "2025-03-03", inserted: 3 });
    expect((await alice("GET", `/api/products/${id}/sales`)).body).toEqual([
      { date: "2025-03-01", quantity: 12.5 }, { date: "2025-03-02", quantity: 8 }, { date: "2025-03-03", quantity: 1234.5 },
    ]);
  });

  it("reads what Excel copies: tab-separated cells without a header line", async () => {
    const id = await newProduct(alice);
    const r = await alice("POST", importPath(id), csvForm("01/03/2025\t12,5\n02/03/2025\t8\n"));
    expect(r.body).toMatchObject({ headerless: true, dateColumn: null, quantityColumn: null, delimiter: "\t", days: 2, inserted: 2 });
  });

  describe("dry run: the preview, saving nothing", () => {
    it("says what would happen and writes nothing", async () => {
      const id = await newProduct(alice);
      await alice("POST", importPath(id), csvForm("date,quantity\n2025-03-01,1\n2025-03-02,2\n"));
      const r = await alice("POST", importPath(id, "?dryRun=1"), csvForm("date,quantity\n2025-03-02,50\n2025-03-03,60\nbad,1\n"));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ dryRun: true, days: 2, inserted: 1, updated: 1, rejected: 1, firstDate: "2025-03-02", lastDate: "2025-03-03" });
      expect(r.body.preview).toEqual([{ date: "2025-03-02", quantity: 50 }, { date: "2025-03-03", quantity: 60 }]);
      expect(r.body.errors[0]).toMatchObject({ line: 4, code: "invalid_date", value: "bad" });
      expect((await alice("GET", `/api/products/${id}/sales`)).body).toEqual([{ date: "2025-03-01", quantity: 1 }, { date: "2025-03-02", quantity: 2 }]); // untouched
    });

    it("also tells about the problems an import would have (a file that is no good is refused with a dry run too)", async () => {
      const id = await newProduct(alice);
      const empty = await alice("POST", importPath(id, "?dryRun=1"), csvForm("\n"));
      expect(empty.status).toBe(422);
      expect(empty.body).toMatchObject({ code: "empty_file" });
      const none = await alice("POST", importPath(id, "?dryRun=1"), csvForm("date,quantity\nx,1\ny,2\n"));
      expect(none.status).toBe(422);
      expect(none.body).toMatchObject({ code: "no_valid_rows", errorsTruncated: false });
      expect(none.body.errors).toHaveLength(2);
    });

    it("accepts 0, 1, true and false, and refuses anything else", async () => {
      const id = await newProduct(alice);
      for (const [flag, dry] of [["1", true], ["true", true], ["0", false], ["false", false]] as const) {
        const r = await alice("POST", importPath(id, `?dryRun=${flag}`), csvForm("date,quantity\n2025-03-01,1\n"));
        expect(r.body.dryRun, flag).toBe(dry);
      }
      expect((await alice("POST", importPath(id, "?dryRun=maybe"), csvForm("date,quantity\n2025-03-01,1\n"))).status).toBe(422);
    });
  });

  describe("a date that appears more than once", () => {
    const twice = "date,quantity\n2025-03-01,5\n2025-03-01,7\n2025-03-02,1\n";
    it("by default the last row wins (as before)", async () => {
      const id = await newProduct(alice);
      const r = await alice("POST", importPath(id), csvForm(twice));
      expect(r.body).toMatchObject({ duplicates: "last", duplicatesInFile: 1, days: 2 });
      expect((await alice("GET", `/api/products/${id}/sales`)).body[0]).toEqual({ date: "2025-03-01", quantity: 7 });
    });
    it("duplicates=sum adds them up (a list of single sales)", async () => {
      const id = await newProduct(alice);
      const dry = await alice("POST", importPath(id, "?duplicates=sum&dryRun=1"), csvForm(twice));
      expect(dry.body.preview).toEqual([{ date: "2025-03-01", quantity: 12 }, { date: "2025-03-02", quantity: 1 }]);
      const r = await alice("POST", importPath(id, "?duplicates=sum"), csvForm(twice));
      expect(r.body).toMatchObject({ duplicates: "sum", duplicatesInFile: 1 });
      expect((await alice("GET", `/api/products/${id}/sales`)).body[0]).toEqual({ date: "2025-03-01", quantity: 12 });
    });
    it("adds decimals without floating-point noise", async () => {
      const id = await newProduct(alice);
      const r = await alice("POST", importPath(id, "?duplicates=sum&dryRun=1"), csvForm("date,quantity\n2025-03-01,0.1\n2025-03-01,0.2\n"));
      expect(r.body.preview[0].quantity).toBe(0.3);
    });
    it("refuses another value", async () => {
      const id = await newProduct(alice);
      expect((await alice("POST", importPath(id, "?duplicates=max"), csvForm("date,quantity\n2025-03-01,1\n"))).status).toBe(422);
    });
  });

  describe("when the columns are not understood", () => {
    const strange = "Negozio;Giorno del mese;Cosa\nA;2025-03-01;12\nA;2025-03-02;15\n";
    it("answers with the columns, so that the person can choose", async () => {
      const id = await newProduct(alice);
      const r = await alice("POST", importPath(id, "?dryRun=1"), csvForm(strange));
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ code: "missing_columns", columns: ["Negozio", "Giorno del mese", "Cosa"] });
    });
    it("goes on when they choose (counting from 0)", async () => {
      const id = await newProduct(alice);
      const r = await alice("POST", importPath(id, "?dateColumn=1&quantityColumn=2"), csvForm(strange));
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ dateColumn: "Giorno del mese", quantityColumn: "Cosa", days: 2, inserted: 2 });
    });
    it.each(["?dateColumn=1", "?quantityColumn=2", "?dateColumn=a&quantityColumn=2", "?dateColumn=-1&quantityColumn=2", "?dateColumn=1&quantityColumn=1000"])(
      "refuses odd choices: %s",
      async (query) => {
        const id = await newProduct(alice);
        const r = await alice("POST", importPath(id, query), csvForm(strange));
        expect([422]).toContain(r.status);
      },
    );
    it("columns that do not exist in the file are refused with the columns again", async () => {
      const id = await newProduct(alice);
      const r = await alice("POST", importPath(id, "?dateColumn=7&quantityColumn=8"), csvForm(strange));
      expect(r.status).toBe(422);
      expect(r.body.code).toBe("missing_columns");
    });
  });

  it("limit errors carry a code and the numbers, so that the dashboard can explain them", async () => {
    const id = await newProduct(alice);
    const lines = ["date,quantity"];
    for (let i = 0; i < 5001; i++) lines.push(`${new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10)},1`);
    const r = await alice("POST", importPath(id), csvForm(lines.join("\n")));
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: "too_many_rows", rows: 5001, maxRows: 5000 });
  });

  it("a product that would hold too many days says so with a code", async () => {
    const id = await newProduct(alice);
    for (let chunk = 0; chunk < 2; chunk++) {
      const lines = ["date,quantity"];
      for (let i = 0; i < 1825; i++) lines.push(`${new Date(Date.UTC(2000, 0, 1 + chunk * 1825 + i)).toISOString().slice(0, 10)},1`);
      expect((await alice("POST", importPath(id), csvForm(lines.join("\n")))).status).toBe(200);
    }
    const r = await alice("POST", importPath(id, "?dryRun=1"), csvForm("date,quantity\n2030-01-01,1\n"));
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: "product_full", maxDays: 3650 });
  });
});

