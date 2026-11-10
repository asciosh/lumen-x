import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { problem, unauthorized } from "./http";

/** Settings of Cloudflare Access for this Worker (see wrangler.jsonc). */
export interface AuthConfig {
  /** For example "https://myteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** The "Audience (AUD) tag" of the Access application. */
  ACCESS_AUD?: string;
}

export type AuthResult = { ok: true; email: string } | { ok: false; response: Response };

const remoteKeys = new Map<string, JWTVerifyGetKey>();

function keysOf(teamDomain: string): JWTVerifyGetKey {
  let keys = remoteKeys.get(teamDomain);
  if (keys === undefined) {
    keys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    remoteKeys.set(teamDomain, keys);
  }
  return keys;
}

/**
 * Who is calling? Cloudflare Access logs the user in at the edge and adds a signed token to every request
 * (header Cf-Access-Jwt-Assertion). The token is checked here anyway: if someone changes the Access policy by mistake,
 * or reaches the Worker by another address, the requests still cannot pass without a valid token.
 *
 * Closed by default: with the settings missing, every request is refused.
 * `keys` is only for the tests (they sign tokens with their own key).
 */
export async function authenticate(request: Request, config: AuthConfig, keys?: JWTVerifyGetKey): Promise<AuthResult> {
  const teamDomain = config.ACCESS_TEAM_DOMAIN?.trim().replace(/\/+$/, "");
  const audience = config.ACCESS_AUD?.trim();
  if (!teamDomain || !audience) {
    return {
      ok: false,
      response: problem(503, "Login is not configured", "The Cloudflare Access settings of this Worker are missing."),
    };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (token === null || token.length === 0) {
    return { ok: false, response: unauthorized("Missing login token.") };
  }

  try {
    const { payload } = await jwtVerify(token, keys ?? keysOf(teamDomain), {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"],
    });
    const email = typeof payload["email"] === "string" ? payload["email"].trim().toLowerCase() : "";
    if (email.length === 0) {
      return { ok: false, response: unauthorized("The login token has no email.") };
    }
    return { ok: true, email };
  } catch {
    return { ok: false, response: unauthorized("Invalid login token.") };
  }
}
