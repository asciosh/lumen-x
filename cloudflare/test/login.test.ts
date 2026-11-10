import { describe, expect, it } from "vitest";
import { allowedUsers } from "../src/worker/allowlist";
import { handleAuth, type LoginConfig, type LoginDeps } from "../src/worker/login";
import { SESSION_COOKIE, parseCookies, readSession } from "../src/worker/session";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-11-10T10:00:00.000Z");
const CONFIG: LoginConfig = { SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: "client-id", GITHUB_CLIENT_SECRET: "client-secret", ALLOWED_GITHUB_USERS: "Alice, bob\nCarol" };

interface Calls { url: string; init?: RequestInit }

/** A stand-in for GitHub: knows a few users and the codes it handed out. */
function fakeGitHub(options: { tokenBody?: unknown; userStatus?: number; userBody?: unknown } = {}) {
  const calls: Calls[] = [];
  const users: Record<string, { id: number; login: string }> = { "code-alice": { id: 1, login: "alice" }, "code-mallory": { id: 3, login: "mallory" }, "code-carol": { id: 4, login: "Carol" } };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/login/oauth/access_token")) {
      const { code } = JSON.parse(String(init?.body)) as { code: string };
      const body = options.tokenBody ?? (users[code] ? { access_token: `token-for-${code}` } : { error: "bad_verification_code" });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); // GitHub answers 200 even on errors
    }
    if (url.endsWith("/user")) {
      const code = String((init?.headers as Record<string, string>)["authorization"]).replace("Bearer token-for-", "");
      return new Response(JSON.stringify(options.userBody ?? users[code] ?? {}), { status: options.userStatus ?? 200 });
    }
    return new Response("?", { status: 404 });
  };
  return { fetchFn, calls };
}

const deps = (fetchFn: typeof fetch): LoginDeps => ({ now: () => NOW, fetch: fetchFn, newState: () => "fixed-state" });
const get = (path: string, cookie?: string) => new Request(`https://lumenx.test${path}`, { headers: cookie ? { cookie } : {} });
const cookiesOf = (res: Response) => res.headers.getSetCookie();

describe("allowedUsers", () => {
  it("splits on commas, spaces and new lines, and ignores the case", () => {
    expect([...allowedUsers(" Alice,bob  carol\n\nDAVE ")].sort()).toEqual(["alice", "bob", "carol", "dave"]);
    expect(allowedUsers(undefined).size).toBe(0);
    expect(allowedUsers("").size).toBe(0);
  });
});

describe("GET /auth/login", () => {
  it("sends the user to GitHub with a state, and remembers the state in a short-lived cookie", async () => {
    const res = await handleAuth(get("/auth/login"), CONFIG, deps(fakeGitHub().fetchFn));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("https://lumenx.test/auth/callback");
    expect(location.searchParams.get("state")).toBe("fixed-state");
    expect(location.searchParams.get("scope")).toBeNull(); // no permissions asked: only the public profile
    expect(cookiesOf(res)).toEqual(["lumenx_oauth_state=fixed-state; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax"]);
  });

  it("a fresh state every time", async () => {
    const real = { now: () => NOW, fetch: fakeGitHub().fetchFn, newState: undefined as unknown as () => string };
    const { defaultLoginDeps } = await import("../src/worker/login");
    real.newState = defaultLoginDeps().newState;
    const a = new URL((await handleAuth(get("/auth/login"), CONFIG, real)).headers.get("location")!).searchParams.get("state");
    const b = new URL((await handleAuth(get("/auth/login"), CONFIG, real)).headers.get("location")!).searchParams.get("state");
    expect(a).not.toBe(b);
    expect(a!.length).toBeGreaterThanOrEqual(40);
  });

  it("is closed while the settings are missing", async () => {
    expect((await handleAuth(get("/auth/login"), { ...CONFIG, SESSION_SECRET: "short" }, deps(fakeGitHub().fetchFn))).status).toBe(503);
    expect((await handleAuth(get("/auth/login"), { ...CONFIG, GITHUB_CLIENT_ID: undefined }, deps(fakeGitHub().fetchFn))).status).toBe(503);
    expect((await handleAuth(get("/auth/login"), { ...CONFIG, GITHUB_CLIENT_SECRET: "" }, deps(fakeGitHub().fetchFn))).status).toBe(503);
  });
});

describe("GET /auth/callback", () => {
  const callback = (code: string | null, state = "fixed-state", cookie = "lumenx_oauth_state=fixed-state") =>
    get(`/auth/callback?${code === null ? "" : `code=${code}&`}state=${state}`, cookie);

  it("signs in an allowed user: a signed session cookie and back to the app", async () => {
    const gh = fakeGitHub();
    const res = await handleAuth(callback("code-alice"), CONFIG, deps(gh.fetchFn));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    const cookies = cookiesOf(res);
    const session = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(session).toContain("HttpOnly");
    expect(session).toContain("Secure");
    expect(session).toContain("SameSite=Lax");
    expect(await readSession(parseCookies(session.split(";")[0]!)[SESSION_COOKIE], SECRET, NOW.getTime() / 1000)).toMatchObject({ id: 1, login: "alice" });
    expect(cookies.some((c) => c.startsWith("lumenx_oauth_state=;") && c.includes("Max-Age=0"))).toBe(true); // the state is used once
  });

  it("compares the usernames without caring for the case", async () => {
    const res = await handleAuth(callback("code-carol"), CONFIG, deps(fakeGitHub().fetchFn)); // GitHub says "Carol", the list says "Carol" and "carol"
    expect(res.status).toBe(302);
  });

  it("sends the client secret to GitHub only, and never to the browser", async () => {
    const gh = fakeGitHub();
    const res = await handleAuth(callback("code-alice"), CONFIG, deps(gh.fetchFn));
    expect(gh.calls[0]!.url).toBe("https://github.com/login/oauth/access_token");
    expect(String(gh.calls[0]!.init?.body)).toContain("client-secret");
    expect(JSON.stringify([...res.headers.entries()])).not.toContain("client-secret");
    expect(JSON.stringify([...res.headers.entries()])).not.toContain("token-for-");
    expect(gh.calls[1]!.url).toBe("https://api.github.com/user");
  });

  it("refuses a GitHub account that is not on the list, and gives no session", async () => {
    const res = await handleAuth(callback("code-mallory"), CONFIG, deps(fakeGitHub().fetchFn));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("not allowed");
    expect(cookiesOf(res).some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it("refuses everybody when the list is empty", async () => {
    const res = await handleAuth(callback("code-alice"), { ...CONFIG, ALLOWED_GITHUB_USERS: "" }, deps(fakeGitHub().fetchFn));
    expect(res.status).toBe(403);
  });

  it("refuses a state that does not match the cookie, or a missing cookie (forged sign-in)", async () => {
    const gh = fakeGitHub();
    expect((await handleAuth(callback("code-alice", "other-state"), CONFIG, deps(gh.fetchFn))).status).toBe(400);
    expect((await handleAuth(get("/auth/callback?code=code-alice&state=fixed-state"), CONFIG, deps(gh.fetchFn))).status).toBe(400); // no cookie at all
    expect((await handleAuth(callback("code-alice", "fixed-state", "a=1; b=2"), CONFIG, deps(gh.fetchFn))).status).toBe(400); // other cookies only
    expect((await handleAuth(get("/auth/callback?code=code-alice"), CONFIG, deps(gh.fetchFn))).status).toBe(400);
    expect(gh.calls).toHaveLength(0); // GitHub is not even asked
  });

  it("a cancelled sign-in has no code", async () => {
    expect((await handleAuth(callback(null), CONFIG, deps(fakeGitHub().fetchFn))).status).toBe(400);
  });

  it("says so when GitHub refuses the code, even if it answers 200", async () => {
    const res = await handleAuth(callback("expired-code"), CONFIG, deps(fakeGitHub().fetchFn));
    expect(res.status).toBe(502);
    expect(cookiesOf(res).some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it.each([
    ["no token", { tokenBody: {} }],
    ["token of the wrong type", { tokenBody: { access_token: 42 } }],
    ["the user call fails", { userStatus: 500 }],
    ["the user has no id", { userBody: { login: "alice" } }],
    ["the id is not a number", { userBody: { id: "1", login: "alice" } }],
    ["the user has no login", { userBody: { id: 1 } }],
  ])("survives a strange answer from GitHub: %s", async (_label, options) => {
    const res = await handleAuth(callback("code-alice"), CONFIG, deps(fakeGitHub(options).fetchFn));
    expect(res.status).toBe(502);
    expect(cookiesOf(res).some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it("survives GitHub being unreachable", async () => {
    const down: typeof fetch = async () => {
      throw new Error("network");
    };
    expect((await handleAuth(callback("code-alice"), CONFIG, deps(down))).status).toBe(502);
  });

  it("does not put what GitHub says into the page as HTML", async () => {
    const gh = fakeGitHub({ userBody: { id: 9, login: '<script>alert("x")</script>' } });
    const html = await (await handleAuth(callback("code-alice"), CONFIG, deps(gh.fetchFn))).text();
    expect(html).not.toContain("<script>");
  });
});

describe("POST /auth/logout", () => {
  const post = (headers: Record<string, string> = {}) => new Request("https://lumenx.test/auth/logout", { method: "POST", headers });

  it("clears the session cookie", async () => {
    const res = await handleAuth(post(), CONFIG, deps(fakeGitHub().fetchFn));
    expect(res.status).toBe(204);
    expect(cookiesOf(res)[0]).toContain(`${SESSION_COOKIE}=;`);
    expect(cookiesOf(res)[0]).toContain("Max-Age=0");
  });

  it("refuses a cross-site POST and a GET", async () => {
    expect((await handleAuth(post({ origin: "https://evil.example" }), CONFIG, deps(fakeGitHub().fetchFn))).status).toBe(403);
    expect((await handleAuth(get("/auth/logout"), CONFIG, deps(fakeGitHub().fetchFn))).status).toBe(405);
  });
});

describe("local runs and tests", () => {
  it("can point to a stand-in for GitHub", async () => {
    const res = await handleAuth(get("/auth/login"), { ...CONFIG, GITHUB_URL: "http://127.0.0.1:9912/" }, deps(fakeGitHub().fetchFn));
    expect(res.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:9912\/login\/oauth\/authorize\?/);
  });

  it("unknown /auth routes are 404", async () => {
    expect((await handleAuth(get("/auth/whatever"), CONFIG, deps(fakeGitHub().fetchFn))).status).toBe(404);
  });
});
