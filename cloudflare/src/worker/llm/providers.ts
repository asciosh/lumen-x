/** The AI providers the Worker can use. Each one is switched on only if its settings exist (secrets in the Worker). */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Why a provider could not answer: it decides how long it is left alone. */
export class LlmError extends Error {
  constructor(
    public readonly kind: "rate_limit" | "auth" | "not_found" | "server" | "timeout" | "bad_response",
    message: string,
    /** From the Retry-After header, or until the daily quota resets. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmProvider {
  id: string;
  label: string;
  complete(system: string, user: string, signal: AbortSignal): Promise<string>;
}

/** The settings of the providers (secrets and variables of the Worker). */
export interface LlmEnv {
  /** Workers AI binding ("ai" in wrangler.jsonc). No key. */
  AI?: { run(model: string, input: unknown): Promise<unknown> };
  WORKERS_AI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  /** Comma-separated provider ids, in the order they are tried. Default: workers-ai, gemini, groq, openrouter. */
  LLM_ORDER?: string;
  /** Only for tests and local runs: a stand-in for the address of a provider. */
  LLM_URL_GEMINI?: string;
  LLM_URL_GROQ?: string;
  LLM_URL_OPENROUTER?: string;
}

const DEFAULT_ORDER = ["workers-ai", "gemini", "groq", "openrouter"];

const OPENAI_COMPATIBLE = [
  { id: "gemini", label: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", key: "GEMINI_API_KEY", model: "GEMINI_MODEL", override: "LLM_URL_GEMINI" },
  { id: "groq", label: "Groq", url: "https://api.groq.com/openai/v1", key: "GROQ_API_KEY", model: "GROQ_MODEL", override: "LLM_URL_GROQ" },
  { id: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/api/v1", key: "OPENROUTER_API_KEY", model: "OPENROUTER_MODEL", override: "LLM_URL_OPENROUTER" },
] as const;

const secondsUntilMidnightUtc = (): number => {
  const now = new Date();
  return Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000);
};

function classify(status: number, retryAfter: string | null): LlmError {
  if (status === 429) {
    const seconds = retryAfter !== null && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) : undefined;
    return new LlmError("rate_limit", "The provider is rate limiting", seconds);
  }
  if (status === 401 || status === 403) return new LlmError("auth", "The provider refused the key");
  if (status === 404) return new LlmError("not_found", "The provider does not know the model");
  if (status >= 500) return new LlmError("server", `The provider answered ${status}`);
  return new LlmError("bad_response", `The provider answered ${status}`);
}

function openAiCompatible(id: string, label: string, baseUrl: string, key: string, model: string, fetchFn: FetchFn): LlmProvider {
  return {
    id,
    label,
    async complete(system, user, signal) {
      let response: Response;
      try {
        response = await fetchFn(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
            temperature: 0.3,
            max_tokens: 800,
          }),
          signal,
        });
      } catch (error) {
        throw new LlmError((error as Error).name === "AbortError" ? "timeout" : "server", "The provider is unreachable");
      }
      if (!response.ok) throw classify(response.status, response.headers.get("retry-after"));
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new LlmError("bad_response", "The provider did not send JSON");
      }
      const text = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.trim().length === 0) throw new LlmError("bad_response", "The provider sent no text");
      return text;
    },
  };
}

function workersAi(env: LlmEnv, model: string): LlmProvider {
  return {
    id: "workers-ai",
    label: "Cloudflare Workers AI",
    async complete(system, user, signal) {
      let result: unknown;
      try {
        // The binding has no way to cancel a call: the wait is cut when the time is over.
        result = await Promise.race([
          env.AI!.run(model, { messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.3, max_tokens: 800 }),
          new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new LlmError("timeout", "Workers AI did not answer in time")))),
        ]);
      } catch (error) {
        if (error instanceof LlmError) throw error;
        // The free daily quota is 10,000 Neurons: after that the call fails (code 3036) until midnight UTC.
        if (/3036|daily free allocation|neurons/i.test((error as Error).message)) throw new LlmError("rate_limit", "Workers AI daily quota used up", secondsUntilMidnightUtc());
        throw new LlmError("server", "Workers AI failed");
      }
      const direct = (result as { response?: unknown })?.response;
      const compatible = (result as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      const text = typeof direct === "string" ? direct : compatible;
      if (typeof text !== "string" || text.trim().length === 0) throw new LlmError("bad_response", "Workers AI sent no text");
      return text;
    },
  };
}

/** The providers that have their settings, in the order they are tried. */
export function enabledProviders(env: LlmEnv, fetchFn: FetchFn): LlmProvider[] {
  const byId = new Map<string, LlmProvider>();
  if (env.AI && env.WORKERS_AI_MODEL?.trim()) byId.set("workers-ai", workersAi(env, env.WORKERS_AI_MODEL.trim()));
  for (const p of OPENAI_COMPATIBLE) {
    const key = env[p.key]?.trim();
    const model = env[p.model]?.trim();
    if (key && model) byId.set(p.id, openAiCompatible(p.id, p.label, env[p.override]?.trim() || p.url, key, model, fetchFn));
  }
  const order = env.LLM_ORDER?.trim() ? env.LLM_ORDER.split(",").map((s) => s.trim().toLowerCase()) : DEFAULT_ORDER;
  return order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
