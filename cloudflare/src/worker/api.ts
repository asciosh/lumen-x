import { answer } from "../engine/chat/answer";
import { detectLanguage, normalize } from "../engine/chat/question";
import { parseSalesCsv } from "../engine/csv";
import { buildFacts, explain, normalizeLanguage, type ExplanationFacts, type Language } from "../engine/explain";
import { rewriteExplanation } from "./llm/gateway";
import { enabledProviders, type FetchFn, type LlmEnv } from "./llm/providers";
import { runForecast } from "../engine/forecast";
import { calculateReorder } from "../engine/reorder";
import { buildSummary } from "../engine/summary";
import { SeriesError, type MethodRequest, type SalePoint } from "../engine/types";
import { Store, type Db, type ProductDto, type StoredForecast } from "./db";
import { badRequest, conflict, invalid, json, methodNotAllowed, notFound, problem, tooLarge } from "./http";
import { LIMITS } from "./limits";

export interface ApiContext {
  db: Db;
  /** Who owns the data: "github:<numeric id>". */
  owner: string;
  /** The GitHub username, for display. */
  login: string;
  now: () => Date;
  /** The AI settings (secrets of the Worker) and the way to reach the providers. Without them, the AI is off. */
  llm?: LlmEnv;
  fetch?: FetchFn;
}

const METHODS: readonly MethodRequest[] = ["auto", "naive", "ets"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Routes of the API: /api/me, /api/me/data, /api/products, /api/products/:id, .../sales, .../sales/import, .../forecast,
 * .../forecast/explanation, .../reorder, .../ask
 */
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
    return method === "GET" ? json({ login: ctx.login }) : methodNotAllowed(["GET"]);
  }
  if (url.pathname === "/api/ai") {
    return method === "GET" ? aiStatus(ctx, store) : methodNotAllowed(["GET"]);
  }
  if (url.pathname === "/api/me/data") {
    // "Delete all my data": every product of this user, with its sales and forecasts.
    if (method !== "DELETE") return methodNotAllowed(["DELETE"]);
    await store.deleteAllForOwner(ctx.owner);
    return new Response(null, { status: 204 });
  }

  const match = /^\/api\/products(?:\/(\d+)(?:\/(sales\/import|sales|forecast\/explanation\/ai|forecast\/explanation|forecast|reorder|summary|ask))?)?$/.exec(url.pathname);
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
    case "forecast/explanation":
      return method === "GET" ? explanation(url, store, product) : methodNotAllowed(["GET"]);
    case "forecast/explanation/ai":
      return method === "POST" ? rewriteWithAi(url, ctx, store, product) : methodNotAllowed(["POST"]);
    case "reorder":
      return method === "GET" ? reorder(url, store, product) : methodNotAllowed(["GET"]);
    case "summary":
      return method === "GET" ? summary(url, store, product) : methodNotAllowed(["GET"]);
    case "ask":
      return method === "POST" ? ask(request, store, product) : methodNotAllowed(["POST"]);
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

type ReorderParams = { ok: false; error: Response } | { ok: true; lead: number; review: number; level: number; onHand: number | null };

/** The parameters of a reorder calculation, from the query string (days for delivery, days between orders, service level, stock). */
function reorderParams(url: URL): ReorderParams {
  const lead = intParam(url, "leadTimeDays", 7);
  const review = intParam(url, "reviewDays", 7);
  const level = intParam(url, "serviceLevel", 95);
  if (lead === null || review === null || level === null) {
    return { ok: false, error: invalid("leadTimeDays, reviewDays and serviceLevel must be whole numbers.") };
  }
  let onHand: number | null = null;
  const rawStock = url.searchParams.get("onHand");
  if (rawStock !== null && rawStock.trim().length > 0) {
    onHand = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(rawStock.trim()) ? Number(rawStock) : Number.NaN;
  }
  return { ok: true, lead, review, level, onHand };
}

const zeroPercentOf = (sales: readonly SalePoint[]): number => (sales.length === 0 ? 0 : (sales.filter((s) => s.quantity === 0).length * 100) / sales.length);

async function reorder(url: URL, store: Store, product: ProductDto): Promise<Response> {
  const params = reorderParams(url);
  if (!params.ok) return params.error;
  const context = await forecastContext(store, product);
  if (!context.ok) return context.error;
  const outcome = calculateReorder(context.run, params.lead, params.review, params.level, params.onHand, zeroPercentOf(context.sales));
  return outcome.ok ? json({ forecastRunId: context.run.id, ...outcome.suggestion }) : invalid(outcome.error);
}

/**
 * The three answers in one: how much will I sell, how much do I order (the same parameters as the reorder endpoint), how much can I trust it.
 * A reorder that cannot be worked out (for example a forecast shorter than the period to cover) is not an error here: `order` is null and
 * `orderError` says why.
 */
async function summary(url: URL, store: Store, product: ProductDto): Promise<Response> {
  const params = reorderParams(url);
  if (!params.ok) return params.error;
  const context = await forecastContext(store, product);
  if (!context.ok) return context.error;
  const outcome = calculateReorder(context.run, params.lead, params.review, params.level, params.onHand, zeroPercentOf(context.sales));
  return json({ forecastRunId: context.run.id, ...buildSummary(context.facts, outcome) });
}

type ForecastContext = { ok: false; error: Response } | { ok: true; run: StoredForecast; sales: SalePoint[]; facts: ExplanationFacts };

/** The latest forecast of a product with its sales and the facts computed from them (or the error to answer with). */
async function forecastContext(store: Store, product: ProductDto): Promise<ForecastContext> {
  const run = await store.latestForecast(product.id);
  if (run === null) return { ok: false, error: notFound("No forecast has been computed for this product yet.") };
  const sales = await store.listSales(product.id, null, null);
  if (sales.length === 0 || run.forecast.length === 0) {
    return { ok: false, error: invalid("Sales or forecast points are missing: the explanation cannot be built.") };
  }
  return { ok: true, run, sales, facts: buildFacts(product.name, sales, run) };
}

type ExplanationInput = { ok: false; error: Response } | { ok: true; language: Language; run: StoredForecast; facts: ExplanationFacts };

/** Loads what an explanation needs: the language, the latest forecast and the facts (or the error to answer with). */
async function explanationInput(url: URL, store: Store, product: ProductDto): Promise<ExplanationInput> {
  const language = normalizeLanguage(url.searchParams.get("lang"));
  if (language === null) return { ok: false, error: invalid("'lang' must be 'it' or 'en'.") };
  const context = await forecastContext(store, product);
  if (!context.ok) return context;
  return { ok: true, language, run: context.run, facts: context.facts };
}

/** The explanation of the latest forecast, written by the code (no AI): ?lang=it|en (default it). */
async function explanation(url: URL, store: Store, product: ProductDto): Promise<Response> {
  const input = await explanationInput(url, store, product);
  if (!input.ok) return input.error;
  const { language, run, facts } = input;
  return json({ forecastRunId: run.id, language, text: explain(facts, language), source: "template", note: null, facts });
}

const today = (ctx: ApiContext) => ctx.now().toISOString().slice(0, 10);

/** Is the AI on, with which providers, and how many rewrites the user has left today. */
async function aiStatus(ctx: ApiContext, store: Store): Promise<Response> {
  const providers = enabledProviders(ctx.llm ?? {}, ctx.fetch ?? fetch);
  const used = await store.aiUsedToday(ctx.owner, today(ctx));
  return json({
    enabled: providers.length > 0,
    providers: providers.map((p) => ({ id: p.id, label: p.label })),
    dailyLimit: LIMITS.aiRewritesPerUserPerDay,
    usedToday: used,
    remaining: Math.max(0, LIMITS.aiRewritesPerUserPerDay - used),
  });
}

/**
 * "Rewrite with AI": the same explanation, rewritten by an AI provider from the numbers only (never the product name, never the sales rows).
 * If no provider works, or the AI writes figures that are not in the facts, the answer is the text written by the code, with a note.
 */
async function rewriteWithAi(url: URL, ctx: ApiContext, store: Store, product: ProductDto): Promise<Response> {
  const input = await explanationInput(url, store, product);
  if (!input.ok) return input.error;
  const { language, run, facts } = input;

  const day = today(ctx);
  const used = await store.aiUsedToday(ctx.owner, day);
  if (used >= LIMITS.aiRewritesPerUserPerDay) {
    return problem(429, "Too many requests", `You have used your ${LIMITS.aiRewritesPerUserPerDay} AI rewrites for today. The count restarts at 00:00 UTC.`);
  }

  const outcome = await rewriteExplanation(facts, language, { env: ctx.llm ?? {}, store, now: ctx.now, fetch: ctx.fetch ?? fetch });
  if (outcome.completions > 0) {
    await store.addAiUse(ctx.owner, day);
  }
  const remaining = Math.max(0, LIMITS.aiRewritesPerUserPerDay - used - (outcome.completions > 0 ? 1 : 0));
  if (outcome.kind === "ok") {
    return json({ forecastRunId: run.id, language, text: outcome.text, source: "ai", provider: outcome.provider, providerLabel: outcome.label, note: null, remaining });
  }
  return json({ forecastRunId: run.id, language, text: explain(facts, language), source: "template", provider: null, providerLabel: null, note: outcome.note, remaining });
}

const MIN_QUESTION_LENGTH = 3;
const MAX_QUESTION_LENGTH = 300;

/** Questions about the data, answered by rules (no AI). Body: { "question": "...", "language": "it" | "en" } (the language is optional). */
async function ask(request: Request, store: Store, product: ProductDto): Promise<Response> {
  const body = await readJsonObject(request);
  if (body instanceof Response) return body;

  const question = typeof body["question"] === "string" ? body["question"].trim() : "";
  if (question.length < MIN_QUESTION_LENGTH || question.length > MAX_QUESTION_LENGTH) {
    return invalid(`Write a question of at least ${MIN_QUESTION_LENGTH} and at most ${MAX_QUESTION_LENGTH} characters.`);
  }

  let language: Language;
  const requested = body["language"];
  if (requested === undefined || requested === null || (typeof requested === "string" && requested.trim().length === 0)) {
    language = detectLanguage(normalize(question));
  } else {
    const normalized = typeof requested === "string" ? normalizeLanguage(requested) : null;
    if (normalized === null) return invalid("'language' must be 'it' or 'en'.");
    language = normalized;
  }

  const sales = await store.listSales(product.id, null, null);
  const run = await store.latestForecast(product.id);
  const zeroDays = sales.filter((s) => s.quantity === 0).length;
  const result = answer(question, language, {
    productName: product.name,
    sales,
    forecast: run,
    zeroDaysPercent: sales.length === 0 ? 0 : (zeroDays * 100) / sales.length,
  });
  return json({ question, language, intent: result.intent, understood: result.understood, answer: result.text, suggestions: result.suggestions });
}
