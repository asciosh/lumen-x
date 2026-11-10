import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { authenticate } from "../src/worker/auth";

const TEAM = "https://myteam.cloudflareaccess.com";
const AUD = "a".repeat(64);
const CONFIG = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };

let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: "RS256", use: "sig" }] });
});

function token(overrides: { email?: unknown; iss?: string; aud?: string; exp?: string | number; key?: CryptoKey; alg?: string } = {}) {
  const jwt = new SignJWT({ email: "email" in overrides ? overrides.email : "Alice@Example.com" })
    .setProtectedHeader({ alg: overrides.alg ?? "RS256" })
    .setIssuer(overrides.iss ?? TEAM)
    .setAudience(overrides.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? "1h");
  return jwt.sign(overrides.key ?? privateKey);
}

const request = (jwt?: string) =>
  new Request("https://lumenx.test/api/me", { headers: jwt === undefined ? {} : { "cf-access-jwt-assertion": jwt } });

async function status(result: Awaited<ReturnType<typeof authenticate>>) {
  return result.ok ? "ok" : result.response.status;
}

describe("authenticate", () => {
  it("accepts a valid token and returns the email in lower case", async () => {
    const r = await authenticate(request(await token()), CONFIG, keys);
    expect(r).toEqual({ ok: true, email: "alice@example.com" });
  });

  it("refuses everything when the settings are missing (closed by default)", async () => {
    for (const config of [{}, { ACCESS_TEAM_DOMAIN: TEAM }, { ACCESS_AUD: AUD }, { ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" }]) {
      expect(await status(await authenticate(request(await token()), config, keys))).toBe(503);
    }
  });

  it("refuses a request without the token", async () => {
    expect(await status(await authenticate(request(), CONFIG, keys))).toBe(401);
    expect(await status(await authenticate(request(""), CONFIG, keys))).toBe(401);
  });

  it("refuses garbage", async () => {
    expect(await status(await authenticate(request("not-a-jwt"), CONFIG, keys))).toBe(401);
  });

  it("refuses a token signed with another key", async () => {
    expect(await status(await authenticate(request(await token({ key: otherPrivateKey })), CONFIG, keys))).toBe(401);
  });

  it("refuses a token for another application (wrong audience)", async () => {
    expect(await status(await authenticate(request(await token({ aud: "b".repeat(64) })), CONFIG, keys))).toBe(401);
  });

  it("refuses a token from another team (wrong issuer)", async () => {
    expect(await status(await authenticate(request(await token({ iss: "https://evil.cloudflareaccess.com" })), CONFIG, keys))).toBe(401);
  });

  it("refuses an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(await status(await authenticate(request(await token({ exp: past })), CONFIG, keys))).toBe(401);
  });

  it("refuses a token without an email", async () => {
    expect(await status(await authenticate(request(await token({ email: undefined })), CONFIG, keys))).toBe(401);
    expect(await status(await authenticate(request(await token({ email: 42 })), CONFIG, keys))).toBe(401);
    expect(await status(await authenticate(request(await token({ email: "  " })), CONFIG, keys))).toBe(401);
  });

  it("refuses an unsigned token (alg none)", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ email: "alice@example.com", iss: TEAM, aud: AUD, exp: 9999999999 })}.`;
    expect(await status(await authenticate(request(unsigned), CONFIG, keys))).toBe(401);
  });

  it("accepts the team domain written with a trailing slash", async () => {
    const r = await authenticate(request(await token()), { ACCESS_TEAM_DOMAIN: `${TEAM}/`, ACCESS_AUD: AUD }, keys);
    expect(r.ok).toBe(true);
  });

  it("does not say why a token was refused", async () => {
    const r = await authenticate(request("not-a-jwt"), CONFIG, keys);
    if (r.ok) throw new Error("should have been refused");
    expect(JSON.stringify(await r.response.json())).not.toMatch(/signature|expired|claim/i);
  });
});
