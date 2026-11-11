import { describe, expect, it } from "vitest";
import { handleAuth, type LoginConfig, type LoginDeps } from "../src/worker/login";
import { SESSION_COOKIE, parseCookies, readSession } from "../src/worker/session";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-11-10T10:00:00.000Z");
const CONFIG: LoginConfig = {
  SESSION_SECRET: SECRET,
  GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret", ALLOWED_GITHUB_USERS: "alice",
  GOOGLE_CLIENT_ID: "google-id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "google-secret", ALLOWED_GOOGLE_EMAILS: "Carol@Example.com, dave@example.com",
};

interface Call { url: string; init?: RequestInit }
type Person = { sub: string; email: string; email_verified: unknown };

/** A stand-in for Google: three addresses (authorize is only a redirect), a token and the userinfo. */
function fakeGoogle(options: { tokenBody?: unknown; userStatus?: number; userBody?: unknown } = {}) {
  const calls: Call[] = [];
  const people: Record<string, Person> = {
    "code-carol": { sub: "110169484474386276334", email: "Carol@Example.com", email_verified: true },
    "code-dave": { sub: "110169484474386276999", email: "dave@example.com", email_verified: "true" },
    "code-mallory": { sub: "110169484474386270000", email: "mallory@example.com", email_verified: true },
    "code-unverified": { sub: "110169484474386271111", email: "carol@example.com", email_verified: false },
  };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      const code = new URLSearchParams(String(init?.body)).get("code") ?? "";
      const body = options.tokenBody ?? (people[code] ? { access_token: `token-for-${code}` } : { error: "invalid_grant" });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      const code = String((init?.headers as Record<string, string>)["authorization"]).replace("Bearer token-for-", "");
      return new Response(JSON.stringify(options.userBody ?? people[code] ?? {}), { status: options.userStatus ?? 200 });
    }
    return new Response("?", { status: 404 });
  };
  return { fetchFn, calls };
}

const deps = (fetchFn: typeof fetch): LoginDeps => ({ now: () => NOW, fetch: fetchFn, newState: () => "fixed-state" });
const get = (path: string, cookie?: string) => new Request(`https://lumenx.test${path}`, { headers: cookie ? { cookie } : {} });
const cookiesOf = (res: Response) => res.headers.getSetCookie();
const noFetch = deps(async () => { throw new Error("nobody should be called"); });

describe("GET /auth/providers", () => {
  it("says which sign-in buttons to show, and nothing secret", async () => {
    const res = await handleAuth(get("/auth/providers"), CONFIG, noFetch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ github: true, google: true });
    expect(await handleAuth(get("/auth/providers"), { SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" }, noFetch).then((r) => r.json())).toEqual({ github: false, google: true });
    expect(await handleAuth(get("/auth/providers"), { SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: "x" }, noFetch).then((r) => r.json())).toEqual({ github: false, google: false }); // an id without its secret is not a login
  });
  it("is not cached, answers only GET, and is closed with the session secret missing", async () => {
    expect((await handleAuth(get("/auth/providers"), CONFIG, noFetch)).headers.get("cache-control")).toBe("no-store");
    expect((await handleAuth(new Request("https://lumenx.test/auth/providers", { method: "POST" }), CONFIG, noFetch)).status).toBe(405);
    expect((await handleAuth(get("/auth/providers"), {}, noFetch)).status).toBe(503);
  });
});

describe("GET /auth/google/login", () => {
  it("sends the person to Google with the right request, and remembers the state in a short-lived cookie", async () => {
    const res = await handleAuth(get("/auth/google/login"), CONFIG, noFetch);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: "google-id.apps.googleusercontent.com",
      redirect_uri: "https://lumenx.test/auth/google/callback",
      response_type: "code",
      scope: "openid email", // only the email and the id: not the name, not the photo, not the contacts
      state: "fixed-state",
      prompt: "select_account",
    });
    expect(location.search).not.toContain("google-secret");
    const cookie = cookiesOf(res).find((c) => c.startsWith("lumenx_oauth_state="))!;
    expect(cookie).toContain("fixed-state");
    expect(cookie).toMatch(/Max-Age=600/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/auth");
  });
  it("is closed while the Google settings are missing (an id without its secret is not enough), and only GET", async () => {
    expect((await handleAuth(get("/auth/google/login"), { SESSION_SECRET: SECRET }, noFetch)).status).toBe(503);
    expect((await handleAuth(get("/auth/google/login"), { SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: "x" }, noFetch)).status).toBe(503);
    expect((await handleAuth(new Request("https://lumenx.test/auth/google/login", { method: "POST" }), CONFIG, noFetch)).status).toBe(405);
  });
  it("the GitHub login does not need Google, and the other way round", async () => {
    expect((await handleAuth(get("/auth/login"), { SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b" }, noFetch)).status).toBe(302);
    expect((await handleAuth(get("/auth/login"), { SESSION_SECRET: SECRET, GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" }, noFetch)).status).toBe(503);
    expect((await handleAuth(get("/auth/google/login"), { SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: "a", GITHUB_CLIENT_SECRET: "b" }, noFetch)).status).toBe(503);
  });
  it("unknown routes under /auth/google/ are 404", async () => {
    expect((await handleAuth(get("/auth/google/nope"), CONFIG, noFetch)).status).toBe(404);
  });
});

describe("GET /auth/google/callback", () => {
  const callback = (code: string | null, state = "fixed-state", cookie = "lumenx_oauth_state=fixed-state") =>
    get(`/auth/google/callback?${code === null ? "" : `code=${code}&`}state=${state}`, cookie);
  const sessionOf = async (res: Response) => {
    const cookie = cookiesOf(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    return cookie === undefined ? null : readSession(parseCookies(cookie.split(";")[0]!)[SESSION_COOKIE], SECRET, NOW.getTime() / 1000);
  };

  it("signs in an invited person: a signed cookie with the id as text and the email in lower case", async () => {
    const g = fakeGoogle();
    const res = await handleAuth(callback("code-carol"), CONFIG, deps(g.fetchFn));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const cookie = cookiesOf(res).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(await sessionOf(res)).toMatchObject({ provider: "google", id: "110169484474386276334", login: "carol@example.com" });
    expect(cookiesOf(res).some((c) => c.startsWith("lumenx_oauth_state=;") && c.includes("Max-Age=0"))).toBe(true); // the state is used once
  });

  it("asks Google for the token with the secret (in the body, to Google only) and for the email with the token", async () => {
    const g = fakeGoogle();
    await handleAuth(callback("code-carol"), CONFIG, deps(g.fetchFn));
    expect(g.calls.map((c) => c.url)).toEqual(["https://oauth2.googleapis.com/token", "https://openidconnect.googleapis.com/v1/userinfo"]);
    const form = new URLSearchParams(String(g.calls[0]!.init?.body));
    expect(Object.fromEntries(form)).toEqual({
      code: "code-carol", client_id: "google-id.apps.googleusercontent.com", client_secret: "google-secret",
      redirect_uri: "https://lumenx.test/auth/google/callback", grant_type: "authorization_code",
    });
    expect((g.calls[0]!.init?.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect((g.calls[1]!.init?.headers as Record<string, string>)["authorization"]).toBe("Bearer token-for-code-carol");
  });

  it("never gives the client secret to the browser", async () => {
    const res = await handleAuth(callback("code-carol"), CONFIG, deps(fakeGoogle().fetchFn));
    expect(JSON.stringify([...res.headers.entries()]) + (await res.text())).not.toContain("google-secret");
  });

  it("accepts email_verified as true or \"true\" (Google has used both), and compares the emails without caring for the case", async () => {
    expect((await sessionOf(await handleAuth(callback("code-dave"), CONFIG, deps(fakeGoogle().fetchFn))))?.login).toBe("dave@example.com");
    expect((await sessionOf(await handleAuth(callback("code-carol"), { ...CONFIG, ALLOWED_GOOGLE_EMAILS: "CAROL@example.COM" }, deps(fakeGoogle().fetchFn))))?.login).toBe("carol@example.com");
  });

  it("refuses a Google account that is not on the list, with no session, and says which one", async () => {
    const res = await handleAuth(callback("code-mallory"), CONFIG, deps(fakeGoogle().fetchFn));
    expect(res.status).toBe(403);
    expect(await sessionOf(res)).toBeNull();
    expect(await res.text()).toContain("mallory@example.com");
  });

  it("refuses everybody when the list is missing or empty", async () => {
    for (const list of [undefined, "", "  \n "]) {
      const res = await handleAuth(callback("code-carol"), { ...CONFIG, ALLOWED_GOOGLE_EMAILS: list }, deps(fakeGoogle().fetchFn));
      expect(res.status, JSON.stringify(list)).toBe(403);
      expect(await sessionOf(res)).toBeNull();
    }
  });

  it("the GitHub list does not let a Google account in", async () => {
    const res = await handleAuth(callback("code-carol"), { ...CONFIG, ALLOWED_GOOGLE_EMAILS: undefined, ALLOWED_GITHUB_USERS: "carol@example.com" }, deps(fakeGoogle().fetchFn));
    expect(res.status).toBe(403);
  });

  it("refuses an email that Google has not verified (it could be anybody's), even if it is on the list", async () => {
    for (const verified of [false, "false", undefined, null, "yes", 1]) {
      const g = fakeGoogle({ userBody: { sub: "110169484474386271111", email: "carol@example.com", email_verified: verified } });
      const res = await handleAuth(callback("code-carol"), CONFIG, deps(g.fetchFn));
      expect(res.status, String(verified)).toBe(502);
      expect(await sessionOf(res)).toBeNull();
    }
  });

  it.each([
    ["no id", { email: "carol@example.com", email_verified: true }],
    ["an id that is not digits", { sub: "abc", email: "carol@example.com", email_verified: true }],
    ["a number as id", { sub: 110169484474386276334, email: "carol@example.com", email_verified: true }],
    ["no email", { sub: "110169484474386276334", email_verified: true }],
    ["an email without @", { sub: "110169484474386276334", email: "carol", email_verified: true }],
    ["an email with spaces", { sub: "110169484474386276334", email: "ca rol@example.com", email_verified: true }],
    ["an email far too long", { sub: "110169484474386276334", email: `${"a".repeat(250)}@example.com`, email_verified: true }],
  ])("refuses an answer with %s", async (_label, body) => {
    const res = await handleAuth(callback("code-carol"), CONFIG, deps(fakeGoogle({ userBody: body }).fetchFn));
    expect(res.status).toBe(502);
    expect(await sessionOf(res)).toBeNull();
  });

  it("refuses a state that does not match the cookie, or a missing cookie (forged sign-in), without calling Google", async () => {
    for (const request of [callback("code-carol", "other-state"), callback("code-carol", "fixed-state", "lumenx_oauth_state=another"), callback("code-carol", "fixed-state", ""), get("/auth/google/callback?code=code-carol")]) {
      const res = await handleAuth(request, CONFIG, noFetch);
      expect(res.status).toBe(400);
      expect(await sessionOf(res)).toBeNull();
    }
  });

  it("a cancelled sign-in has no code", async () => {
    const res = await handleAuth(callback(null), CONFIG, noFetch);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("cancelled");
  });

  it("says so when Google refuses the code, even if it answers 200", async () => {
    for (const tokenBody of [{ error: "invalid_grant" }, {}, { access_token: "" }, { access_token: 42 }]) {
      const res = await handleAuth(callback("code-carol"), CONFIG, deps(fakeGoogle({ tokenBody }).fetchFn));
      expect(res.status).toBe(502);
      expect(await sessionOf(res)).toBeNull();
    }
    expect((await handleAuth(callback("code-carol"), CONFIG, deps(fakeGoogle({ userStatus: 401 }).fetchFn))).status).toBe(502);
  });

  it("survives Google being unreachable or sending something that is not JSON", async () => {
    const down: typeof fetch = async () => { throw new TypeError("network"); };
    expect((await handleAuth(callback("code-carol"), CONFIG, deps(down))).status).toBe(502);
    const html: typeof fetch = async () => new Response("<html>", { status: 200 });
    expect((await handleAuth(callback("code-carol"), CONFIG, deps(html))).status).toBe(502);
  });

  it("does not put what Google says into the page as HTML", async () => {
    const hostile = { sub: "110169484474386270000", email: "<script>alert(1)</script>@example.com", email_verified: true };
    const res = await handleAuth(callback("code-mallory"), CONFIG, deps(fakeGoogle({ userBody: hostile }).fetchFn));
    const html = await res.text();
    expect(res.status).toBe(403);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&#60;script&#62;alert(1)&#60;/script&#62;");
    // and an address with spaces (a way to smuggle attributes in) is refused before it gets anywhere
    const sneaky = { sub: "110169484474386270000", email: "<img src=x onerror=alert(1)>@example.com", email_verified: true };
    expect((await handleAuth(callback("code-mallory"), CONFIG, deps(fakeGoogle({ userBody: sneaky }).fetchFn))).status).toBe(502);
  });

  it("can point to stand-ins for the three addresses of Google (local runs and tests)", async () => {
    const seen: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      seen.push(String(input));
      return String(input).endsWith("/token")
        ? new Response(JSON.stringify({ access_token: "t" }))
        : new Response(JSON.stringify({ sub: "110169484474386276334", email: "carol@example.com", email_verified: true }));
    };
    const config: LoginConfig = { ...CONFIG, GOOGLE_AUTH_URL: "http://127.0.0.1:1/auth", GOOGLE_TOKEN_URL: "http://127.0.0.1:1/token", GOOGLE_USERINFO_URL: "http://127.0.0.1:1/userinfo" };
    expect((await handleAuth(get("/auth/google/login"), config, noFetch)).headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:1\/auth\?/);
    expect((await handleAuth(callback("any"), config, deps(fetchFn))).status).toBe(302);
    expect(seen).toEqual(["http://127.0.0.1:1/token", "http://127.0.0.1:1/userinfo"]);
  });
});

describe("POST /auth/logout, with a Google session", () => {
  it("clears the cookie as for GitHub", async () => {
    const res = await handleAuth(new Request("https://lumenx.test/auth/logout", { method: "POST" }), CONFIG, noFetch);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
