import { handle } from "./api";
import { authenticate, type AuthConfig } from "./auth";
import type { Db } from "./db";

export interface Env extends AuthConfig {
  /** The D1 database (binding "DB" in wrangler.jsonc). */
  DB: Db;
  /** The static files of the dashboard (folder "public"). */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const auth = await authenticate(request, env);
    if (!auth.ok) {
      return auth.response;
    }
    return handle(request, { db: env.DB, owner: auth.email, now: () => new Date() });
  },
};
