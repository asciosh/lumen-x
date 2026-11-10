import { isAllowed } from "./allowlist";
import { problem, unauthorized } from "./http";
import { MIN_SECRET_LENGTH, SESSION_COOKIE, parseCookies, readSession } from "./session";

export interface SessionConfig {
  /** Random text of at least 32 characters, used to sign the session cookies. Keep it secret. */
  SESSION_SECRET?: string;
  /** The list of allowed GitHub usernames: checked on every request, so removing a name locks that person out at once. */
  ALLOWED_GITHUB_USERS?: string;
}

export type AuthResult = { ok: true; owner: string; login: string } | { ok: false; response: Response };

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
  if (!isAllowed(session.login, config.ALLOWED_GITHUB_USERS)) {
    return { ok: false, response: problem(403, "Forbidden", "This account is not allowed to use the app (any more).") };
  }
  return { ok: true, owner: `github:${session.id}`, login: session.login };
}
