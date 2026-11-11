import { describe, expect, it } from "vitest";
import { clearCookie, createSession, parseCookies, readSession, setCookie } from "../src/worker/session";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000;
const alice = { id: 42, login: "alice" };

describe("sessions", () => {
  it("a session we created is read back", async () => {
    const token = await createSession(alice, SECRET, NOW);
    expect(await readSession(token, SECRET, NOW + 10)).toEqual({ provider: "github", id: 42, login: "alice", exp: NOW + 14 * 24 * 3600 });
  });

  it("expires", async () => {
    const token = await createSession(alice, SECRET, NOW, 100);
    expect(await readSession(token, SECRET, NOW + 99)).not.toBeNull();
    expect(await readSession(token, SECRET, NOW + 100)).toBeNull();
    expect(await readSession(token, SECRET, NOW + 5000)).toBeNull();
  });

  it("is refused with another secret", async () => {
    const token = await createSession(alice, SECRET, NOW);
    expect(await readSession(token, "x".repeat(40), NOW)).toBeNull();
  });

  it("is refused if the content was changed (to become somebody else)", async () => {
    const token = await createSession(alice, SECRET, NOW);
    const [v, , sig] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ id: 1, login: "admin", exp: NOW + 99999 })).toString("base64url");
    expect(await readSession(`${v}.${forgedPayload}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("is refused if the signature was changed", async () => {
    const token = await createSession(alice, SECRET, NOW);
    expect(await readSession(token.slice(0, -3) + "AAA", SECRET, NOW)).toBeNull();
    expect(await readSession(token + "x", SECRET, NOW)).toBeNull();
  });

  it.each([null, undefined, "", "garbage", "v1.a.b", "v2.a.b", "a.b", "v1..", "v1.%%%.%%%"])("refuses %j", async (value) => {
    expect(await readSession(value, SECRET, NOW)).toBeNull();
  });

  it("refuses a signed payload with the wrong shape", async () => {
    const sign = async (payload: unknown) => {
      // Same format as a real session, signed with the real secret, but with a payload we would never create.
      const body = `v1.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("base64url");
      return `${body}.${sig}`;
    };
    for (const bad of [{ id: "42", login: "a", exp: NOW + 9 }, { id: 0, login: "a", exp: NOW + 9 }, { id: 1.5, login: "a", exp: NOW + 9 }, { id: 1, login: "", exp: NOW + 9 }, { id: 1, login: "a" }, [1, 2], "text", null]) {
      expect(await readSession(await sign(bad), SECRET, NOW), JSON.stringify(bad)).toBeNull();
    }
    expect(await readSession(await sign({ id: 1, login: "a", exp: NOW + 9 }), SECRET, NOW)).not.toBeNull();
  });
});

describe("cookies", () => {
  it("parses a Cookie header", () => {
    expect(parseCookies("a=1; lumenx_session=v1.x.y; b=two=2")).toEqual({ a: "1", lumenx_session: "v1.x.y", b: "two=2" });
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("sets a cookie that scripts cannot read and other sites cannot send", () => {
    const c = setCookie("lumenx_session", "abc", 3600);
    expect(c).toBe("lumenx_session=abc; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax");
  });

  it("clears a cookie", () => {
    expect(clearCookie("lumenx_session")).toContain("Max-Age=0");
  });
});

describe("sessions with Google, and cookies made before Google existed", () => {
  const sign = async (payload: unknown) => {
    // A cookie as the previous version made it: v1.<payload>.<signature>, with no provider.
    const body = `v1.${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    return `${body}.${btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  };

  it("a Google session keeps the 21-digit id as text and the email as the login", async () => {
    const token = await createSession({ provider: "google", id: "110169484474386276334", login: "carol@example.com" }, SECRET, NOW);
    expect(await readSession(token, SECRET, NOW + 1)).toEqual({ provider: "google", id: "110169484474386276334", login: "carol@example.com", exp: NOW + 14 * 24 * 3600 });
  });

  it("a cookie of the previous version (no provider) is still a valid GitHub session", async () => {
    const token = await sign({ id: 42, login: "alice", exp: NOW + 1000 });
    expect(await readSession(token, SECRET, NOW)).toEqual({ provider: "github", id: 42, login: "alice", exp: NOW + 1000 });
  });

  it.each([
    ["a GitHub session with a text id", { provider: "github", id: "42", login: "a" }],
    ["a Google session with a number id", { provider: "google", id: 42, login: "a@b.c" }],
    ["a Google id that is not digits", { provider: "google", id: "abc", login: "a@b.c" }],
    ["a Google id that is far too long", { provider: "google", id: "1".repeat(41), login: "a@b.c" }],
    ["an unknown provider", { provider: "facebook", id: 1, login: "a" }],
  ])("refuses %s", async (_label, payload) => {
    expect(await readSession(await sign({ ...payload, exp: NOW + 1000 }), SECRET, NOW)).toBeNull();
  });
});

