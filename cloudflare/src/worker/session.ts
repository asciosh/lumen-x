/** Signed session cookie: who is logged in, for how long. Nothing is stored on the server. */
export const SESSION_COOKIE = "lumenx_session";
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

export type Provider = "github" | "google";

export interface Session {
  /** Where the person signed in. A cookie made before Google existed has no provider: it is GitHub. */
  provider: Provider;
  /** The id the provider gives to the account, which never changes: a number for GitHub, a string of digits for Google (it does not fit in a JavaScript number). */
  id: number | string;
  /** The GitHub username, or the Google email: what the list of invited people is checked against, on every request. */
  login: string;
  /** Expiry, in seconds since 1970. */
  exp: number;
}

const encoder = new TextEncoder();
const VERSION = "v1";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(
  user: { id: number | string; login: string; provider?: Provider },
  secret: string,
  nowSeconds: number,
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
  const payload: Session = { provider: user.provider ?? "github", id: user.id, login: user.login, exp: nowSeconds + ttlSeconds };
  const body = `${VERSION}.${toBase64Url(encoder.encode(JSON.stringify(payload)))}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

/** The session if the signature is valid and it has not expired; null otherwise (never says why). */
export async function readSession(token: string | null | undefined, secret: string, nowSeconds: number): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const signature = fromBase64Url(parts[2]!);
  if (signature === null) return null;
  // verify() compares in constant time.
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), signature, encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return null;

  const raw = fromBase64Url(parts[1]!);
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (typeof data !== "object" || data === null) return null;
    const { id, login, exp, provider = "github" } = data as Record<string, unknown>;
    if (provider !== "github" && provider !== "google") return null;
    if (provider === "github" && (typeof id !== "number" || !Number.isInteger(id) || id <= 0)) return null;
    if (provider === "google" && (typeof id !== "string" || !/^\d{5,40}$/.test(id))) return null;
    if (typeof login !== "string" || login.length === 0) return null;
    if (typeof exp !== "number" || !(exp > nowSeconds)) return null;
    return { provider, id: id as number | string, login, exp };
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number, path = "/"): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string, path = "/"): string {
  return setCookie(name, "", 0, path);
}

export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
