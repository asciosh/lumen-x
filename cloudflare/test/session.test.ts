import { describe, expect, it } from "vitest";
import { clearCookie, createSession, parseCookies, readSession, setCookie } from "../src/worker/session";

const SECRET = "s".repeat(40);
const NOW = 1_800_000_000;
const alice = { id: 42, login: "alice" };

describe("sessions", () => {
  it("a session we created is read back", async () => {
    const token = await createSession(alice, SECRET, NOW);
    expect(await readSession(token, SECRET, NOW + 10)).toEqual({ id: 42, login: "alice", exp: NOW + 14 * 24 * 3600 });
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
