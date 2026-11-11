import { beforeEach, describe, expect, it } from "vitest";
import { explain, type ExplanationFacts } from "../src/engine/explain";
import { handle } from "../src/worker/api";
import { Store, type Db } from "../src/worker/db";
import { rewriteExplanation } from "../src/worker/llm/gateway";
import { PRODUCT_TOKEN, buildPrompt, restoreProductName } from "../src/worker/llm/prompt";
import { enabledProviders, LlmError, type FetchFn, type LlmEnv } from "../src/worker/llm/providers";
import { LIMITS } from "../src/worker/limits";
import { createTestDb } from "./helpers/sqlite-d1";

const FACTS: ExplanationFacts = {
  productName: "Caffè Segreto 77", historyDays: 90, historyEnd: "2025-03-31", methodUsed: "ets", horizon: 28, forecastStart: "2025-04-01", forecastEnd: "2025-04-28",
  forecastTotal: 3360, forecastAvgPerDay: 120, referenceDays: 28, referenceAvgPerDay: 100, changePercent: 20, strongestWeekday: "Saturday", strongestWeekdayAvg: 150,
  weakestWeekday: "Monday", weakestWeekdayAvg: 90, intervalHalfWidthPercent: 12, holdoutDays: 14, maeUsed: 3, maeNaive: 5, improvementVsNaivePercent: 40,
  filledMissingDays: 0, zeroDaysPercent: 0,
};
/** What a good AI answers: the text written by the code, with the product called [[PRODUCT]]. */
const GOOD_EN = explain(FACTS, "en").replaceAll(FACTS.productName, PRODUCT_TOKEN);
const GOOD_IT = explain(FACTS, "it").replaceAll(FACTS.productName, PRODUCT_TOKEN);

interface Call { url: string; headers: Record<string, string>; body: string }

/** A stand-in for the providers: `handler(url, callNumber)` decides each answer. */
function fakeFetch(handler: (url: string, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn: FetchFn = async (input, init) => {
    calls.push({ url: input, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? "") });
    return handler(input, calls.length);
  };
  return { fn, calls };
}
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const status = (code: number, headers: Record<string, string> = {}) => new Response("{}", { status: code, headers });

const ENV: LlmEnv = { GROQ_API_KEY: "groq-key", GROQ_MODEL: "groq-model", GEMINI_API_KEY: "gem-key", GEMINI_MODEL: "gem-model" };
const NOW = new Date("2026-11-10T10:00:00.000Z");
const LIMIT = LIMITS.aiRewritesPerUserPerDay;

describe("prompt", () => {
  it("never contains the product name, and tells the AI to use a placeholder", () => {
    for (const language of ["it", "en"]) {
      const { system, user } = buildPrompt(FACTS, language);
      expect(system + user).not.toContain("Caffè");
      expect(system + user).not.toContain("Segreto");
      expect(system).toContain(PRODUCT_TOKEN);
      expect(system).toContain(language === "en" ? "Write in English" : "Write in Italian");
    }
  });
  it("sends the numbers as JSON, without the sales rows", () => {
    const { user } = buildPrompt(FACTS, "en");
    const json = JSON.parse(user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1));
    expect(json).toMatchObject({ forecastTotal: 3360, horizon: 28, methodUsed: "ets" });
    expect("productName" in json).toBe(false);
  });
  it("puts the real name back, every time the placeholder appears", () => {
    expect(restoreProductName(`${PRODUCT_TOKEN} sells. ${PRODUCT_TOKEN}!`, "Pane")).toBe("Pane sells. Pane!");
    expect(restoreProductName("no placeholder", "Pane")).toBe("no placeholder");
  });
});

describe("providers", () => {
  it("none is on without its settings; a key without a model (or the contrary) is not enough", () => {
    expect(enabledProviders({}, fakeFetch(() => ok("x")).fn)).toEqual([]);
    expect(enabledProviders({ GROQ_API_KEY: "k" }, fakeFetch(() => ok("x")).fn)).toEqual([]);
    expect(enabledProviders({ GROQ_MODEL: "m" }, fakeFetch(() => ok("x")).fn)).toEqual([]);
    expect(enabledProviders({ AI: { run: async () => ({}) } }, fakeFetch(() => ok("x")).fn)).toEqual([]); // binding without a model
  });
  it("are tried in the default order, or in the one chosen", () => {
    const all: LlmEnv = { ...ENV, AI: { run: async () => ({}) }, WORKERS_AI_MODEL: "@cf/x", OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "m" };
    expect(enabledProviders(all, fakeFetch(() => ok("x")).fn).map((p) => p.id)).toEqual(["workers-ai", "gemini", "groq", "openrouter"]);
    expect(enabledProviders({ ...all, LLM_ORDER: " Groq , gemini, nope" }, fakeFetch(() => ok("x")).fn).map((p) => p.id)).toEqual(["groq", "gemini"]);
  });

  describe("OpenAI-compatible (Gemini, Groq, OpenRouter)", () => {
    const provider = (handler: Parameters<typeof fakeFetch>[0]) => {
      const f = fakeFetch(handler);
      return { p: enabledProviders({ GROQ_API_KEY: "secret-key", GROQ_MODEL: "the-model" }, f.fn)[0]!, calls: f.calls };
    };
    const signal = () => new AbortController().signal;

    it("sends the key only in the header, to the provider's own address, with the model and two messages", async () => {
      const { p, calls } = provider(() => ok("hello"));
      expect(await p.complete("SYSTEM", "USER", signal())).toBe("hello");
      expect(calls[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
      expect(calls[0]!.headers["authorization"]).toBe("Bearer secret-key");
      expect(calls[0]!.body).not.toContain("secret-key");
      expect(JSON.parse(calls[0]!.body)).toMatchObject({ model: "the-model", messages: [{ role: "system", content: "SYSTEM" }, { role: "user", content: "USER" }], temperature: 0.3 });
    });
    it.each([[429, "rate_limit"], [401, "auth"], [403, "auth"], [404, "not_found"], [500, "server"], [503, "server"], [400, "bad_response"]])("status %s is %s", async (code, kind) => {
      const { p } = provider(() => status(code));
      await expect(p.complete("s", "u", signal())).rejects.toMatchObject({ name: "LlmError", kind });
    });
    it("reads Retry-After from a 429", async () => {
      const { p } = provider(() => status(429, { "retry-after": "120" }));
      await expect(p.complete("s", "u", signal())).rejects.toMatchObject({ kind: "rate_limit", retryAfterSeconds: 120 });
    });
    it.each([["not json", new Response("<html>", { status: 200 })], ["no text", new Response(JSON.stringify({ choices: [] }), { status: 200 })], ["blank text", ok("   ")], ["text of the wrong type", new Response(JSON.stringify({ choices: [{ message: { content: 5 } }] }), { status: 200 })]])(
      "a strange answer is a bad response: %s",
      async (_label, response) => {
        const { p } = provider(() => response.clone());
        await expect(p.complete("s", "u", signal())).rejects.toMatchObject({ kind: "bad_response" });
      },
    );
    it("an unreachable provider is a server error, a cancelled call a timeout", async () => {
      const down = provider(() => {
        throw new TypeError("network");
      });
      await expect(down.p.complete("s", "u", signal())).rejects.toMatchObject({ kind: "server" });
      const slow = provider(() => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      });
      await expect(slow.p.complete("s", "u", signal())).rejects.toMatchObject({ kind: "timeout" });
    });
  });

  describe("Workers AI", () => {
    const provider = (run: (model: string, input: unknown) => Promise<unknown>) => enabledProviders({ AI: { run }, WORKERS_AI_MODEL: "@cf/meta/model" }, fakeFetch(() => ok("x")).fn)[0]!;
    const signal = () => new AbortController().signal;

    it("reads both shapes of answer, and sends the model and the messages", async () => {
      let seen: { model: string; input: { messages: unknown[] } } | null = null;
      const direct = provider(async (model, input) => {
        seen = { model, input: input as { messages: unknown[] } };
        return { response: "one" };
      });
      expect(await direct.complete("S", "U", signal())).toBe("one");
      expect(seen).toMatchObject({ model: "@cf/meta/model" });
      expect(seen!.input.messages).toHaveLength(2);
      expect(await provider(async () => ({ choices: [{ message: { content: "two" } }] })).complete("S", "U", signal())).toBe("two");
    });
    it("the daily quota error pauses it until midnight UTC; other errors are server errors", async () => {
      const quota = provider(async () => {
        throw new Error("3036: you have used up your daily free allocation of 10,000 neurons");
      });
      const error = await quota.complete("S", "U", signal()).catch((e) => e as LlmError);
      expect(error).toMatchObject({ kind: "rate_limit" });
      expect((error as LlmError).retryAfterSeconds).toBeGreaterThan(0);
      expect((error as LlmError).retryAfterSeconds).toBeLessThanOrEqual(86_400);
      await expect(provider(async () => { throw new Error("boom"); }).complete("S", "U", signal())).rejects.toMatchObject({ kind: "server" });
    });
    it("no text, or a cancelled wait, is reported", async () => {
      await expect(provider(async () => ({ response: "" })).complete("S", "U", signal())).rejects.toMatchObject({ kind: "bad_response" });
      const controller = new AbortController();
      const hung = provider(() => new Promise(() => {}));
      const pending = hung.complete("S", "U", controller.signal);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ kind: "timeout" });
    });
  });
});

describe("gateway", () => {
  let store: Store;
  let clock: Date;
  beforeEach(() => {
    store = new Store(createTestDb());
    clock = new Date(NOW);
  });
  const run = (language: string, env: LlmEnv, fetchFn: FetchFn) => rewriteExplanation(FACTS, language, { env, store, now: () => clock, fetch: fetchFn });

  it("without any provider says the AI is not configured, and asks nobody", async () => {
    const f = fakeFetch(() => ok("x"));
    expect(await run("en", {}, f.fn)).toEqual({ kind: "fallback", note: "ai_not_configured", completions: 0 });
    expect(f.calls).toHaveLength(0);
  });

  it("uses the first provider, puts the product name back and counts the call", async () => {
    const f = fakeFetch(() => ok(GOOD_EN));
    const r = await run("en", ENV, f.fn);
    expect(r).toMatchObject({ kind: "ok", provider: "gemini", label: "Google Gemini", completions: 1 });
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.text).toContain("For “Caffè Segreto 77” I forecast about 3,360 units");
    expect(f.calls).toHaveLength(1);
    expect(await store.providerState("gemini")).toMatchObject({ day: "2026-11-10", calls: 1, blockedUntil: null });
  });

  it("never sends the product name to any provider", async () => {
    const f = fakeFetch((url) => (url.includes("generativelanguage") ? status(500) : ok(GOOD_IT)));
    await run("it", ENV, f.fn);
    expect(f.calls.length).toBe(2);
    for (const call of f.calls) {
      expect(call.body).not.toContain("Caffè");
      expect(call.body).not.toContain("Segreto");
    }
  });

  it("goes on to the next provider when one fails, and leaves the failed one alone for a while", async () => {
    const f = fakeFetch((url) => (url.includes("generativelanguage") ? status(429, { "retry-after": "300" }) : ok(GOOD_EN)));
    expect(await run("en", ENV, f.fn)).toMatchObject({ kind: "ok", provider: "groq" });
    expect(f.calls.map((c) => new URL(c.url).host)).toEqual(["generativelanguage.googleapis.com", "api.groq.com"]);
    expect((await store.providerState("gemini"))?.blockedUntil).toBe("2026-11-10T10:05:00.000Z");

    f.calls.length = 0;
    expect(await run("en", ENV, f.fn)).toMatchObject({ provider: "groq" });
    expect(f.calls.map((c) => new URL(c.url).host)).toEqual(["api.groq.com"]); // gemini skipped: still paused

    clock = new Date("2026-11-10T10:06:00.000Z"); // the pause is over
    f.calls.length = 0;
    await run("en", ENV, f.fn);
    expect(new URL(f.calls[0]!.url).host).toBe("generativelanguage.googleapis.com");
  });

  it("pauses a provider longer when the key or the model is wrong", async () => {
    const f = fakeFetch((url) => (url.includes("generativelanguage") ? status(401) : ok(GOOD_EN)));
    await run("en", ENV, f.fn);
    expect((await store.providerState("gemini"))?.blockedUntil).toBe("2026-11-10T11:00:00.000Z");
  });

  it("discards a text with invented figures and tries the next provider; both calls count", async () => {
    const f = fakeFetch((url) => (url.includes("generativelanguage") ? ok(`${PRODUCT_TOKEN} will grow 35% next month.`) : ok(GOOD_EN)));
    expect(await run("en", ENV, f.fn)).toMatchObject({ kind: "ok", provider: "groq", completions: 2 });
  });

  it("when every text is rejected the note says so; when every provider fails it says they did not answer", async () => {
    expect(await run("en", ENV, fakeFetch(() => ok("It will sell 999 units")).fn)).toEqual({ kind: "fallback", note: "ai_rejected", completions: 2 });
    expect(await run("en", ENV, fakeFetch(() => status(500)).fn)).toMatchObject({ kind: "fallback", note: "ai_unavailable", completions: 0 });
  });

  it.each([["a leftover placeholder", `${GOOD_EN} [[SOMETHING]]`], ["an empty text", "   "], ["a huge text", "x".repeat(2001)]])("discards %s", async (_label, text) => {
    expect(await run("en", { GROQ_API_KEY: "k", GROQ_MODEL: "m" }, fakeFetch(() => ok(text)).fn)).toMatchObject({ kind: "fallback" });
  });

  it("stops after three providers", async () => {
    const env: LlmEnv = { ...ENV, OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "m", AI: { run: async () => { throw new Error("boom"); } }, WORKERS_AI_MODEL: "@cf/x" };
    const f = fakeFetch(() => status(500));
    expect(await run("en", env, f.fn)).toMatchObject({ kind: "fallback", note: "ai_unavailable" });
    expect(f.calls).toHaveLength(2); // workers-ai (binding) + gemini + groq = 3 attempts; openrouter is the fourth and is not tried
    expect(f.calls.some((c) => c.url.includes("openrouter"))).toBe(false);
  });

  it("skips a provider that used its daily budget, and starts again the next day", async () => {
    for (let i = 0; i < LIMITS.aiCallsPerProviderPerDay; i++) await store.recordProviderCall("gemini", "2026-11-10");
    const f = fakeFetch(() => ok(GOOD_EN));
    await run("en", ENV, f.fn);
    expect(new URL(f.calls[0]!.url).host).toBe("api.groq.com");
    clock = new Date("2026-11-11T00:00:01.000Z");
    f.calls.length = 0;
    await run("en", ENV, f.fn);
    expect(new URL(f.calls[0]!.url).host).toBe("generativelanguage.googleapis.com");
    expect(await store.providerState("gemini")).toMatchObject({ day: "2026-11-11", calls: 1 });
  });

  it("an unexpected error in a provider does not break the request", async () => {
    const f = fakeFetch((url) => {
      if (url.includes("generativelanguage")) throw new Error("something odd");
      return ok(GOOD_EN);
    });
    expect(await run("en", ENV, f.fn)).toMatchObject({ kind: "ok", provider: "groq" });
  });
});

// ------------------------------------------------------------------------------------------------ API
describe("AI endpoints", () => {
  let db: Db;
  let now: Date;
  beforeEach(() => {
    db = createTestDb();
    now = new Date(NOW);
  });
  const WHO = { owner: "github:1", login: "alice" };
  const OTHER = { owner: "github:2", login: "bob" };

  async function call(who: typeof WHO, method: string, path: string, options: { body?: unknown; env?: LlmEnv; fetchFn?: FetchFn; headers?: Record<string, string> } = {}) {
    const init: RequestInit = { method, headers: options.headers ?? {} };
    if (options.body instanceof FormData) init.body = options.body;
    else if (options.body !== undefined) init.body = JSON.stringify(options.body);
    const res = await handle(new Request(`https://lumenx.test${path}`, init), { db, ...who, now: () => now, llm: options.env, fetch: options.fetchFn });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  async function productWithForecast(who = WHO, name = "Caffè Segreto") {
    const id = (await call(who, "POST", "/api/products", { body: { name } })).body.id as number;
    const lines = ["date,quantity"];
    for (let i = 0; i < 200; i++) lines.push(`${new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)},${100 + 10 * (i % 7) + (((i * 37) % 11) - 5) * 3}`);
    const form = new FormData();
    form.set("file", new File([lines.join("\n")], "s.csv"));
    await call(who, "POST", `/api/products/${id}/sales/import`, { body: form });
    await call(who, "POST", `/api/products/${id}/forecast`, { body: { horizon: 28 } });
    return id;
  }
  /** The answer of a good AI for this product: the template text with the name replaced by the placeholder. */
  async function goodAnswer(id: number, language = "en") {
    const template = (await call(WHO, "GET", `/api/products/${id}/forecast/explanation?lang=${language}`)).body.text as string;
    return template.replaceAll("Caffè Segreto", PRODUCT_TOKEN);
  }

  it("GET /api/ai: off without settings, on with the providers that are set, and says how many rewrites are left", async () => {
    expect((await call(WHO, "GET", "/api/ai")).body).toEqual({ enabled: false, providers: [], dailyLimit: LIMIT, usedToday: 0, remaining: LIMIT });
    const on = (await call(WHO, "GET", "/api/ai", { env: ENV })).body;
    expect(on).toMatchObject({ enabled: true, providers: [{ id: "gemini", label: "Google Gemini" }, { id: "groq", label: "Groq" }], remaining: LIMIT });
    expect(JSON.stringify(on)).not.toContain("key"); // no key, no model, nothing secret
    expect((await call(WHO, "POST", "/api/ai")).status).toBe(405);
  });

  it("rewrites with the AI: the text has the real name, nothing private goes out, and the key goes only in the header", async () => {
    const id = await productWithForecast();
    const text = await goodAnswer(id);
    const f = fakeFetch(() => ok(text));
    const r = await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn: f.fn });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ language: "en", source: "ai", provider: "gemini", providerLabel: "Google Gemini", note: null, remaining: LIMIT - 1 });
    expect(r.body.text).toContain("For “Caffè Segreto” I forecast about");
    for (const c of f.calls) {
      expect(c.body).not.toContain("Caffè");
      expect(c.body).not.toContain("date,quantity");
      expect(c.body).not.toContain("gem-key");
    }
    expect((await call(WHO, "GET", "/api/ai", { env: ENV })).body.usedToday).toBe(1);
  });

  it("falls back to the text written by the code, with a note, and does not use up the daily limit when nobody answered", async () => {
    const id = await productWithForecast();
    const template = (await call(WHO, "GET", `/api/products/${id}/forecast/explanation?lang=en`)).body.text;
    const r = await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn: fakeFetch(() => status(500)).fn });
    expect(r.body).toMatchObject({ source: "template", provider: null, note: "ai_unavailable", remaining: LIMIT });
    expect(r.body.text).toBe(template);
  });

  it("a rejected text (invented figures) falls back too, and it does use up one rewrite", async () => {
    const id = await productWithForecast();
    const r = await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn: fakeFetch(() => ok(`${PRODUCT_TOKEN} will sell 123456 units`)).fn });
    expect(r.body).toMatchObject({ source: "template", note: "ai_rejected", remaining: LIMIT - 1 });
  });

  it("says the AI is not configured, with the text written by the code and no rewrite used", async () => {
    const id = await productWithForecast();
    const r = await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: "template", note: "ai_not_configured", remaining: LIMIT, language: "it" });
    expect(r.body.text).toContain("prevedo");
  });

  it("allows the daily number of rewrites per user, then answers 429; other users and the next day are not affected", async () => {
    const id = await productWithForecast();
    const otherId = await productWithForecast(OTHER, "Pane");
    const text = await goodAnswer(id);
    const fetchFn: FetchFn = async () => ok(text);
    for (let i = 0; i < LIMITS.aiRewritesPerUserPerDay; i++) {
      const r = await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn });
      expect(r.body.source, `rewrite ${i + 1}`).toBe("ai");
    }
    const blocked = await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn });
    expect(blocked.status).toBe(429);
    expect(blocked.body.detail).toContain(`${LIMIT} AI rewrites`);

    const bobText = (await call(OTHER, "GET", `/api/products/${otherId}/forecast/explanation?lang=en`)).body.text.replaceAll("Pane", PRODUCT_TOKEN);
    expect((await call(OTHER, "POST", `/api/products/${otherId}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn: async () => ok(bobText) })).body.source).toBe("ai");

    now = new Date("2026-11-11T00:00:00.000Z");
    expect((await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn })).status).toBe(200);
  });

  it("'delete all my data' does not reset the daily limit", async () => {
    const id = await productWithForecast();
    const text = await goodAnswer(id);
    for (let i = 0; i < LIMITS.aiRewritesPerUserPerDay; i++) await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: ENV, fetchFn: async () => ok(text) });
    await call(WHO, "DELETE", "/api/me/data");
    expect((await call(WHO, "GET", "/api/ai", { env: ENV })).body).toMatchObject({ usedToday: LIMIT, remaining: 0 });
  });

  it("needs a forecast, a supported language, the owner and a POST, and refuses a cross-site request", async () => {
    const empty = (await call(WHO, "POST", "/api/products", { body: { name: "Empty" } })).body.id;
    expect((await call(WHO, "POST", `/api/products/${empty}/forecast/explanation/ai`, { env: ENV })).status).toBe(404);
    const id = await productWithForecast();
    expect((await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=fr`, { env: ENV })).status).toBe(422);
    expect((await call(OTHER, "POST", `/api/products/${id}/forecast/explanation/ai`, { env: ENV })).status).toBe(404);
    expect((await call(WHO, "GET", `/api/products/${id}/forecast/explanation/ai`, { env: ENV })).status).toBe(405);
    expect((await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai`, { env: ENV, headers: { origin: "https://evil.example" } })).status).toBe(403);
  });

  it("works with Workers AI through its binding, with no key", async () => {
    const id = await productWithForecast();
    const text = await goodAnswer(id);
    const AI = { run: async () => ({ response: text }) };
    const r = await call(WHO, "POST", `/api/products/${id}/forecast/explanation/ai?lang=en`, { env: { AI, WORKERS_AI_MODEL: "@cf/meta/model" }, fetchFn: fakeFetch(() => status(500)).fn });
    expect(r.body).toMatchObject({ source: "ai", provider: "workers-ai", providerLabel: "Cloudflare Workers AI" });
  });
});
