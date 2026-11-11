import { findUnsupportedNumbers } from "../../engine/numberGuard";
import type { ExplanationFacts } from "../../engine/explain";
import type { Store } from "../db";
import { LIMITS } from "../limits";
import { buildPrompt, restoreProductName } from "./prompt";
import { enabledProviders, LlmError, type FetchFn, type LlmEnv } from "./providers";

export type AiNote = "ai_not_configured" | "ai_unavailable" | "ai_rejected";

export type RewriteOutcome =
  | { kind: "ok"; text: string; provider: string; label: string; completions: number }
  | { kind: "fallback"; note: AiNote; completions: number };

export interface GatewayDeps {
  env: LlmEnv;
  store: Store;
  now: () => Date;
  fetch: FetchFn;
}

const MAX_TEXT_LENGTH = 2000;

/** How long a provider is left alone after an error. */
function pauseSeconds(error: unknown): number {
  if (!(error instanceof LlmError)) return 120;
  switch (error.kind) {
    case "rate_limit": return Math.min(error.retryAfterSeconds ?? 600, 86_400);
    case "auth":
    case "not_found": return 3_600; // the key or the model name is wrong: no point in retrying soon
    default: return 120;
  }
}

/**
 * Rewrites the explanation with the first provider that works: tries them in order, skips the ones paused after an error or that used
 * their daily budget, and discards any text with figures that are not in the facts (then it tries the next provider).
 * If nothing works it says why, and the caller keeps the text written by the code.
 * `completions` counts the providers that did answer (right or wrong): that is what counts against the user's daily limit.
 */
export async function rewriteExplanation(facts: ExplanationFacts, language: string, deps: GatewayDeps): Promise<RewriteOutcome> {
  const providers = enabledProviders(deps.env, deps.fetch);
  if (providers.length === 0) return { kind: "fallback", note: "ai_not_configured", completions: 0 };

  const { system, user } = buildPrompt(facts, language);
  const now = deps.now();
  const day = now.toISOString().slice(0, 10);
  let completions = 0;
  let attempts = 0;
  let rejected = false;

  for (const provider of providers) {
    if (attempts >= LIMITS.aiMaxAttempts) break;
    const state = await deps.store.providerState(provider.id);
    if (state?.blockedUntil && state.blockedUntil > now.toISOString()) continue;
    if (state?.day === day && state.calls >= LIMITS.aiCallsPerProviderPerDay) continue;

    attempts++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIMITS.aiTimeoutMs);
    try {
      const raw = await provider.complete(system, user, controller.signal);
      completions++;
      await deps.store.recordProviderCall(provider.id, day);

      const text = restoreProductName(raw.trim(), facts.productName);
      // Leftover placeholders, empty or huge texts, and figures that are not in the facts: not used.
      if (text.length === 0 || text.length > MAX_TEXT_LENGTH || text.includes("[[") || findUnsupportedNumbers(text, facts, language).length > 0) {
        rejected = true;
        continue;
      }
      return { kind: "ok", text, provider: provider.id, label: provider.label, completions };
    } catch (error) {
      const until = new Date(now.getTime() + pauseSeconds(error) * 1000).toISOString();
      await deps.store.blockProvider(provider.id, until);
    } finally {
      clearTimeout(timer);
    }
  }
  return { kind: "fallback", note: rejected ? "ai_rejected" : "ai_unavailable", completions };
}
