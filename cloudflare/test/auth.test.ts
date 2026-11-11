import { describe, expect, it } from "vitest";
import { authenticate } from "../src/worker/auth";
import { SESSION_COOKIE, createSession } from "../src/worker/session";

const SECRET = "s".repeat(40);
const ALLOWED = "Alice, bob";
const NOW = 1_800_000_000;

const request = (cookie?: string) => new Request("https://lumenx.test/api/me", { headers: cookie === undefined ? {} : { cookie } });

describe("authenticate", () => {
  it("accepts a valid session and names the owner after the GitHub id", async () => {
    const token = await createSession({ id: 42, login: "Alice" }, SECRET, NOW);
    const r = await authenticate(request(`${SESSION_COOKIE}=${token}`), { SESSION_SECRET: SECRET, ALLOWED_GITHUB_USERS: ALLOWED }, NOW + 5);
    expect(r).toEqual({ ok: true, owner: "github:42", login: "Alice", provider: "github" });
  });

  it("refuses everything when the secret is missing or too short (closed by default)", async () => {
    const token = await createSession({ id: 42, login: "alice" }, SECRET, NOW);
    for (const config of [{}, { SESSION_SECRET: "" }, { SESSION_SECRET: "short" }]) {
      const r = await authenticate(request(`${SESSION_COOKIE}=${token}`), config, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(503);
    }
  });

  it.each([["no cookie", undefined], ["other cookies only", "a=1; b=2"], ["garbage", `${SESSION_COOKIE}=nope`]])("refuses: %s", async (_label, cookie) => {
    const r = await authenticate(request(cookie), { SESSION_SECRET: SECRET, ALLOWED_GITHUB_USERS: ALLOWED }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("refuses an expired session and one signed with another secret", async () => {
    const old = await createSession({ id: 1, login: "a" }, SECRET, NOW, 10);
    const other = await createSession({ id: 1, login: "a" }, "z".repeat(40), NOW);
    for (const token of [old, other]) {
      const r = await authenticate(request(`${SESSION_COOKIE}=${token}`), { SESSION_SECRET: SECRET, ALLOWED_GITHUB_USERS: ALLOWED }, NOW + 20);
      expect(r.ok).toBe(false);
    }
  });

  it("locks out somebody who was removed from the list, even with a valid session", async () => {
    const token = await createSession({ id: 42, login: "alice" }, SECRET, NOW);
    for (const list of ["bob", "", undefined, "alic"]) {
      const r = await authenticate(request(`${SESSION_COOKIE}=${token}`), { SESSION_SECRET: SECRET, ALLOWED_GITHUB_USERS: list }, NOW + 5);
      expect(r.ok, String(list)).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(403);
    }
  });

  it("compares the usernames without caring for the case", async () => {
    const token = await createSession({ id: 42, login: "ALICE" }, SECRET, NOW);
    const r = await authenticate(request(`${SESSION_COOKIE}=${token}`), { SESSION_SECRET: SECRET, ALLOWED_GITHUB_USERS: "alice" }, NOW + 5);
    expect(r.ok).toBe(true);
  });

  it("does not say why it refused", async () => {
    const r = await authenticate(request(`${SESSION_COOKIE}=v1.a.b`), { SESSION_SECRET: SECRET, ALLOWED_GITHUB_USERS: ALLOWED }, NOW);
    if (r.ok) throw new Error("should have been refused");
    expect(JSON.stringify(await r.response.json())).not.toMatch(/signature|expired|secret/i);
  });
});

describe("authenticate, with Google", () => {
  const request2 = (cookie: string) => new Request("https://lumenx.test/api/me", { headers: { cookie } });
  const GOOGLE_ID = "110169484474386276334";
  const config = { SESSION_SECRET: SECRET, ALLOWED_GITHUB_USERS: "alice", ALLOWED_GOOGLE_EMAILS: "Carol@Example.com, dave@example.com" };

  it("a Google session is checked against the list of emails, and the owner is google:<id>", async () => {
    const token = await createSession({ provider: "google", id: GOOGLE_ID, login: "carol@example.com" }, SECRET, NOW);
    expect(await authenticate(request2(`${SESSION_COOKIE}=${token}`), config, NOW + 5)).toEqual({ ok: true, owner: `google:${GOOGLE_ID}`, login: "carol@example.com", provider: "google" });
  });

  it("the two lists are separate: a Google email in the GitHub list (or a username in the email list) opens nothing", async () => {
    const asGoogle = await createSession({ provider: "google", id: GOOGLE_ID, login: "alice" }, SECRET, NOW);
    const asGitHub = await createSession({ provider: "github", id: 5, login: "carol@example.com" }, SECRET, NOW);
    expect((await authenticate(request2(`${SESSION_COOKIE}=${asGoogle}`), config, NOW + 5)).ok).toBe(false);
    expect((await authenticate(request2(`${SESSION_COOKIE}=${asGitHub}`), config, NOW + 5)).ok).toBe(false);
  });

  it("removing an email locks that person out at once, even with a valid cookie", async () => {
    const token = await createSession({ provider: "google", id: GOOGLE_ID, login: "carol@example.com" }, SECRET, NOW);
    const r = await authenticate(request2(`${SESSION_COOKIE}=${token}`), { ...config, ALLOWED_GOOGLE_EMAILS: "dave@example.com" }, NOW + 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("a GitHub and a Google account never share data: different owners, even with the same number", async () => {
    const gh = await createSession({ provider: "github", id: 12345, login: "alice" }, SECRET, NOW);
    const g = await createSession({ provider: "google", id: "12345", login: "carol@example.com" }, SECRET, NOW);
    const a = await authenticate(request2(`${SESSION_COOKIE}=${gh}`), config, NOW + 5);
    const b = await authenticate(request2(`${SESSION_COOKIE}=${g}`), config, NOW + 5);
    expect(a.ok && b.ok && a.owner !== b.owner).toBe(true);
  });
});

