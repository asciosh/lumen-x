const BASE_HEADERS = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

/** Error in the shape of the .NET backend (RFC 9457 "problem details"), so one dashboard can talk to both. */
export function problem(status: number, title: string, detail?: string, extra: Record<string, unknown> = {}): Response {
  const body = { title, status, ...(detail === undefined ? {} : { detail }), ...extra };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, "content-type": "application/problem+json; charset=utf-8" },
  });
}

export const notFound = (detail?: string) => problem(404, "Not found", detail);
export const invalid = (detail: string, extra: Record<string, unknown> = {}) => problem(422, "Invalid data", detail, extra);
export const badRequest = (detail: string) => problem(400, "Bad request", detail);
export const conflict = (detail: string) => problem(409, "Conflict", detail);
export const tooLarge = (detail: string) => problem(413, "File too large", detail);
export const unauthorized = (detail: string) => problem(401, "Unauthorized", detail);

export function methodNotAllowed(allowed: string[]): Response {
  const res = problem(405, "Method not allowed");
  res.headers.set("allow", allowed.join(", "));
  return res;
}
