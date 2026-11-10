import { parseSalesCsv } from "../engine/csv";
import { runForecast } from "../engine/forecast";
import { calculateReorder } from "../engine/reorder";
import { SeriesError, type MethodRequest } from "../engine/types";
import { Store, type Db, type ProductDto } from "./db";
import { badRequest, conflict, invalid, json, methodNotAllowed, notFound, problem, tooLarge } from "./http";
import { LIMITS } from "./limits";

export interface ApiContext {
  db: Db;
  /** The verified email of the user (lower case). */
  owner: string;
  now: () => Date;
}

const METHODS: readonly MethodRequest[] = ["auto", "naive", "ets"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Routes of the API: /api/me, /api/products, /api/products/:id, .../sales, .../sales/import, .../forecast, .../reorder */
export async function handle(request: Request, ctx: ApiContext): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // A browser sends the Origin header on cross-site POSTs: a form on another site cannot act with the user's login.
  const origin = request.headers.get("origin");
  if (method !== "GET" && method !== "HEAD" && origin !== null && origin !== url.origin) {
    return problem(403, "Forbidden", "Cross-site requests are not allowed.");
  }

  const store = new Store(ctx.db);

  if (url.pathname === "/api/me") {
    return method === "GET" ? json({ email: ctx.owner }) : methodNotAllowed(["GET"]);
  }

  const match = /^\/api\/products(?:\/(\d+)(?:\/(sales\/import|sales|forecast|reorder))?)?$/.exec(url.pathname);
  if (match === null) {
    return notFound();
  }
  const id = match[1] === undefined ? null : Number(match[1]);
  const part = match[2] ?? null;

  if (id === null) {
    if (method === "GET") return json(await store.listProducts(ctx.owner));
    if (method === "POST") return createProduct(request, ctx, store);
    return methodNotAllowed(["GET", "POST"]);
  }

  const product = await store.getProduct(ctx.owner, id);
  if (product === null) {
    return notFound(`Product ${id} not found.`);
  }

  switch (part) {
    case null:
      if (method === "GET") return json(product);
      if (method === "DELETE") {
        await store.deleteProduct(product.id);
        return new Response(null, { status: 204 });
      }
      return methodNotAllowed(["GET", "DELETE"]);
    case "sales":
      return method === "GET" ? listSales(url, store, product) : methodNotAllowed(["GET"]);
    case "sales/import":
      return method === "POST" ? importSales(request, store, product) : methodNotAllowed(["POST"]);
    case "forecast":
      if (method === "GET") return latestForecast(store, product);
      if (method === "POST") return createForecast(request, ctx, store, product);
      return methodNotAllowed(["GET", "POST"]);
    case "reorder":
      return method === "GET" ? reorder(url, store, product) : methodNotAllowed(["GET"]);
    default:
      return notFound();
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | Response> {
  const text = await request.text();
  if (text.trim().length === 0) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // falls through
  }
  return badRequest("The body must be a JSON object.");
}

async function createProduct(request: Request, ctx: ApiContext, store: Store): Promise<Response> {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const name = typeof body["name"] === "string" ? body["name"].trim() : "";
  const rawSku = body["sku"];
  const sku = typeof rawSku === "string" && rawSku.trim().length > 0 ? rawSku.trim() : null;

  if (name.length === 0) return invalid("The product needs a name.");
  if (name.length > LIMITS.maxNameLength) return invalid(`The name can have at most ${LIMITS.maxNameLength} characters.`);
  if (sku !== null && sku.length > LIMITS.maxSkuLength) return invalid(`The SKU can have at most ${LIMITS.maxSkuLength} characters.`);
  if ((await store.countProducts(ctx.owner)) >= LIMITS.maxProductsPerUser) {
    return invalid(`You can have at most ${LIMITS.maxProductsPerUser} products. Delete one to add another.`);
  }

  const created = await store.createProduct(ctx.owner, name, sku, ctx.now().toISOString());
  if (created === null) {
    return conflict(`A product named '${name}' already exists.`);
  }
  return json(created, 201);
}

async function listSales(url: URL, store: Store, product: ProductDto): Promise<Response> {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  for (const [label, value] of [["from", from], ["to", to]] as const) {
    if (value !== null && !ISO_DATE.test(value)) {
      return invalid(`'${label}' must be a date like 2025-01-31.`);
    }
  }
  return json(await store.listSales(product.id, from, to));
}

async function importSales(request: Request, store: Store, product: ProductDto): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxCsvBytes + 10_000) {
    return tooLarge(`The file can be at most ${LIMITS.maxCsvBytes / 1_000_000} MB.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('Send the CSV as multipart/form-data, in a field named "file".');
  }
  const file = form.get("file");
  if (file === null || typeof file === "string") {
    return invalid('No file received: the CSV must be in a field named "file".');
  }
  if (file.size > LIMITS.maxCsvBytes) {
    return tooLarge(`The file can be at most ${LIMITS.maxCsvBytes / 1_000_000} MB.`);
  }

  const parsed = parseSalesCsv(await file.text());
  if (parsed.fatalError !== undefined) {
    return invalid(parsed.fatalError);
  }
  if (parsed.totalRows > LIMITS.maxRowsPerImport) {
    return invalid(`The file has ${parsed.totalRows} rows: at most ${LIMITS.maxRowsPerImport} can be imported at once.`);
  }

  const listed = parsed.errors.slice(0, LIMITS.maxImportErrorsListed);
  if (parsed.rows.length === 0) {
    return invalid("No valid rows were found in the file.", { errors: listed, errorsTruncated: parsed.errors.length > listed.length });
  }

  // The same date twice in the file: the last row wins.
  const byDate = new Map<string, number>();
  for (const row of parsed.rows) {
    byDate.set(row.date, row.quantity);
  }
  const dates = [...byDate.keys()].sort();
  const existing = await store.existingDates(product.id, dates[0]!, dates[dates.length - 1]!);
  const updated = dates.filter((d) => existing.has(d)).length;
  const inserted = dates.length - updated;

  if ((await store.countSales(product.id)) + inserted > LIMITS.maxDaysPerProduct) {
    return invalid(`A product can hold at most ${LIMITS.maxDaysPerProduct} days of sales.`);
  }

  await store.upsertSales(product.id, dates.map((date) => ({ date, quantity: byDate.get(date)! })));

  return json({
    totalRows: parsed.totalRows,
    validRows: parsed.rows.length,
    inserted,
    updated,
    duplicatesInFile: parsed.rows.length - byDate.size,
    rejected: parsed.errors.length,
    errors: listed,
    errorsTruncated: parsed.errors.length > listed.length,
  });
}

async function createForecast(request: Request, ctx: ApiContext, store: Store, product: ProductDto): Promise<Response> {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const horizon = body["horizon"] === undefined ? 28 : body["horizon"];
  const method = body["method"] === undefined ? "auto" : body["method"];
  if (typeof horizon !== "number" || !Number.isInteger(horizon) || horizon < 1 || horizon > 90) {
    return invalid("The horizon must be a whole number of days between 1 and 90.");
  }
  if (typeof method !== "string" || !METHODS.includes(method as MethodRequest)) {
    return invalid(`Unknown method. Use one of: ${METHODS.join(", ")}.`);
  }

  const sales = await store.latestSales(product.id, LIMITS.maxDaysForForecast);
  try {
    const result = runForecast(sales, horizon, method as MethodRequest);
    return json(await store.saveForecast(product.id, result, ctx.now().toISOString()), 201);
  } catch (error) {
    if (error instanceof SeriesError) {
      return invalid(error.message);
    }
    throw error;
  }
}

async function latestForecast(store: Store, product: ProductDto): Promise<Response> {
  const run = await store.latestForecast(product.id);
  return run === null ? notFound("No forecast has been computed for this product yet.") : json(run);
}

function intParam(url: URL, name: string, fallback: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim().length === 0) return fallback;
  return /^-?\d+$/.test(raw.trim()) ? Number(raw) : null;
}

async function reorder(url: URL, store: Store, product: ProductDto): Promise<Response> {
  const lead = intParam(url, "leadTimeDays", 7);
  const review = intParam(url, "reviewDays", 7);
  const level = intParam(url, "serviceLevel", 95);
  if (lead === null || review === null || level === null) {
    return invalid("leadTimeDays, reviewDays and serviceLevel must be whole numbers.");
  }

  let onHand: number | null = null;
  const rawStock = url.searchParams.get("onHand");
  if (rawStock !== null && rawStock.trim().length > 0) {
    onHand = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(rawStock.trim()) ? Number(rawStock) : Number.NaN;
  }

  const run = await store.latestForecast(product.id);
  if (run === null) {
    return notFound("No forecast has been computed for this product yet.");
  }
  const stats = await store.zeroStats(product.id);
  const zeroPercent = stats.days === 0 ? 0 : (stats.zeroDays * 100) / stats.days;

  const outcome = calculateReorder(run, lead, review, level, onHand, zeroPercent);
  return outcome.ok ? json({ forecastRunId: run.id, ...outcome.suggestion }) : invalid(outcome.error);
}
