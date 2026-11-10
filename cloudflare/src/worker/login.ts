import { isAllowed } from "./allowlist";
import { sessionSecretProblem } from "./auth";
import { problem } from "./http";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, clearCookie, createSession, parseCookies, randomToken, setCookie } from "./session";

export interface LoginConfig {
  SESSION_SECRET?: string;
  /** From the GitHub OAuth app. */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** GitHub usernames allowed to sign in, separated by commas, spaces or new lines. Case does not matter. */
  ALLOWED_GITHUB_USERS?: string;
  /** Only for tests and local runs: a stand-in for github.com and api.github.com. */
  GITHUB_URL?: string;
  GITHUB_API_URL?: string;
}

export interface LoginDeps {
  now: () => Date;
  fetch: typeof fetch;
  newState: () => string;
}

const STATE_COOKIE = "lumenx_oauth_state";
const STATE_TTL_SECONDS = 600;

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(status: number, title: string, message: string, extraCookies: string[] = []): Response {
  const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1117;color:#fef4e2;padding:3rem 1.25rem}main{max-width:36rem;margin:0 auto}h1{color:#fcbb47}a{color:#fcd479}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/">Back to Lumen-X</a></p></main></body></html>`;
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  for (const c of extraCookies) headers.append("set-cookie", c);
  return new Response(body, { status, headers });
}

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

/** Routes of the login: GET /auth/login, GET /auth/callback (where GitHub sends the user back), POST /auth/logout. */
export async function handleAuth(request: Request, config: LoginConfig, deps: LoginDeps): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const broken = sessionSecretProblem(config.SESSION_SECRET);
  if (broken !== null) return broken;

  if (url.pathname === "/auth/logout") {
    if (method !== "POST") return problem(405, "Method not allowed");
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== url.origin) return problem(403, "Forbidden", "Cross-site requests are not allowed.");
    return new Response(null, { status: 204, headers: { "set-cookie": clearCookie(SESSION_COOKIE), "cache-control": "no-store" } });
  }

  if (method !== "GET") return problem(405, "Method not allowed");
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    return problem(503, "Login is not configured", "The GitHub settings of this Worker are missing.");
  }
  const github = (config.GITHUB_URL ?? "https://github.com").replace(/\/+$/, "");
  const api = (config.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");
  const redirectUri = `${url.origin}/auth/callback`;

  if (url.pathname === "/auth/login") {
    const state = deps.newState();
    const authorize = new URL(`${github}/login/oauth/authorize`);
    authorize.searchParams.set("client_id", config.GITHUB_CLIENT_ID);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    return redirect(authorize.toString(), [setCookie(STATE_COOKIE, state, STATE_TTL_SECONDS, "/auth")]);
  }

  if (url.pathname === "/auth/callback") {
    const dropState = clearCookie(STATE_COOKIE, "/auth");
    const state = url.searchParams.get("state");
    const expected = parseCookies(request.headers.get("cookie"))[STATE_COOKIE];
    // The state ties the answer of GitHub to the browser that started the login: it stops a login forged by somebody else.
    if (!state || !expected || state !== expected) {
      return page(400, "Sign-in failed", "The sign-in did not start from this browser, or it took too long. Try again.", [dropState]);
    }
    const code = url.searchParams.get("code");
    if (!code) {
      return page(400, "Sign-in cancelled", "GitHub did not confirm the sign-in. Try again.", [dropState]);
    }

    let token: string;
    try {
      const exchange = await deps.fetch(`${github}/login/oauth/access_token`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "user-agent": "lumen-x" },
        body: JSON.stringify({ client_id: config.GITHUB_CLIENT_ID, client_secret: config.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }),
      });
      const data = (await exchange.json()) as { access_token?: unknown };
      if (typeof data.access_token !== "string" || data.access_token.length === 0) throw new Error("no token");
      token = data.access_token;
    } catch {
      return page(502, "Sign-in failed", "GitHub did not accept the sign-in. Try again.", [dropState]);
    }

    let user: { id: number; login: string };
    try {
      const response = await deps.fetch(`${api}/user`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "lumen-x" },
      });
      if (!response.ok) throw new Error("bad status");
      const data = (await response.json()) as { id?: unknown; login?: unknown };
      if (typeof data.id !== "number" || !Number.isInteger(data.id) || typeof data.login !== "string" || data.login.length === 0) throw new Error("bad shape");
      user = { id: data.id, login: data.login };
    } catch {
      return page(502, "Sign-in failed", "GitHub did not say who you are. Try again.", [dropState]);
    }

    if (!isAllowed(user.login, config.ALLOWED_GITHUB_USERS)) {
      return page(403, "Not on the list", `The GitHub account "${user.login}" is not allowed to use this app yet. Ask the owner to add it.`, [dropState]);
    }

    const session = await createSession(user, config.SESSION_SECRET!, Math.floor(deps.now().getTime() / 1000));
    return redirect("/", [setCookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS), dropState]);
  }

  return problem(404, "Not found");
}

export const defaultLoginDeps = (): LoginDeps => ({ now: () => new Date(), fetch: (input, init) => fetch(input, init), newState: () => randomToken() });
