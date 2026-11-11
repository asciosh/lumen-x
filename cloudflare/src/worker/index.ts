import { handle } from "./api";
import { authenticate } from "./auth";
import type { Db } from "./db";
import type { LlmEnv } from "./llm/providers";
import { defaultLoginDeps, handleAuth, type LoginConfig } from "./login";

export interface Env extends LoginConfig, LlmEnv {
  /** The D1 database (binding "DB" in wrangler.jsonc). */
  DB: Db;
  /** The static files of the dashboard (folder "public"). */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith("/auth/")) {
      return handleAuth(request, env, defaultLoginDeps());
    }
    if (!pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const auth = await authenticate(request, env, Math.floor(Date.now() / 1000));
    if (!auth.ok) {
      return auth.response;
    }
    return handle(request, { db: env.DB, owner: auth.owner, login: auth.login, now: () => new Date(), llm: env, fetch: (input, init) => fetch(input, init) });
  },
};
