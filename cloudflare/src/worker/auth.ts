import { isAllowed } from "./allowlist";
import { problem, unauthorized } from "./http";
import { MIN_SECRET_LENGTH, SESSION_COOKIE, parseCookies, readSession, type Provider } from "./session";

export interface SessionConfig {
  /** Random text of at least 32 characters, used to sign the session cookies. Keep it secret. */
  SESSION_SECRET?: string;
  /** The list of allowed GitHub usernames: checked on every request, so removing a name locks that person out at once. */
  ALLOWED_GITHUB_USERS?: string;
  /** The same for people who sign in with Google: their email addresses. */
  ALLOWED_GOOGLE_EMAILS?: string;
}

export type AuthResult = { ok: true; owner: string; login: string; provider: Provider } | { ok: false; response: Response };

export function sessionSecretProblem(secret: string | undefined): Response | null {
  if (secret === undefined || secret.length < MIN_SECRET_LENGTH) {
    return problem(503, "Login is not configured", "The session secret of this Worker is missing or too short.");
  }
  return null;
}

/**
 * Who is calling? The user logged in with GitHub and got a signed cookie (see login.ts).
 * Closed by default: with the secret missing, every request is refused.
 */
export async function authenticate(request: Request, config: SessionConfig, nowSeconds: number): Promise<AuthResult> {
  const broken = sessionSecretProblem(config.SESSION_SECRET);
  if (broken !== null) {
    return { ok: false, response: broken };
  }
  const cookie = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  const session = await readSession(cookie, config.SESSION_SECRET!, nowSeconds);
  if (session === null) {
    return { ok: false, response: unauthorized("You are not signed in.") };
  }
  const invited = session.provider === "google" ? config.ALLOWED_GOOGLE_EMAILS : config.ALLOWED_GITHUB_USERS;
  if (!isAllowed(session.login, invited)) {
    return { ok: false, response: problem(403, "Forbidden", "This account is not allowed to use the app (any more).") };
  }
  // The owner of the data: the provider and the id it gives to the account (so a GitHub and a Google account are two different people).
  return { ok: true, owner: `${session.provider}:${session.id}`, login: session.login, provider: session.provider };
}
