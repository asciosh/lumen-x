// End-to-end check in the real Cloudflare Workers runtime (workerd), on your machine, with nothing deployed:
//   npm run e2e
// It starts the Worker locally with a local D1 database, signs login tokens with a throwaway key (a small local server
// plays the role of Cloudflare Access), and calls the API with the real Bread series of docs/data/sales.json.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const TEAM = "http://127.0.0.1:9911";
const AUD = "e".repeat(64);
const BASE = "http://127.0.0.1:8799";
const root = new URL("..", import.meta.url).pathname;

let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? "OK  " : "FAIL"} ${message}`);
  if (!condition) failures++;
};

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "k1" };
const accessStandIn = http
  .createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  })
  .listen(9911);
const token = (email) =>
  new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

async function call(email, method, path, body) {
  const headers = email ? { "cf-access-jwt-assertion": await token(email) } : {};
  const init = { method, headers };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  const response = await fetch(BASE + path, init);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: response.status, data };
}

// Fresh local database with the real schema.
spawnSync("npx", ["wrangler", "d1", "execute", "lumenx", "--local", "--file=migrations/0001_init.sql"], { cwd: root, stdio: "ignore" });
const worker = spawn(
  "npx",
  ["wrangler", "dev", "--local", "--port", "8799", "--var", `ACCESS_TEAM_DOMAIN:${TEAM}`, "--var", `ACCESS_AUD:${AUD}`],
  { cwd: root, stdio: "ignore" },
);
const stop = () => {
  worker.kill("SIGTERM");
  spawnSync("pkill", ["-f", "workerd"]);
  accessStandIn.close();
};
process.on("exit", stop);

try {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(BASE + "/");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const sales = JSON.parse(readFileSync(new URL("../../docs/data/sales.json", import.meta.url), "utf8"));
  const csv = "date,quantity\n" + sales.map((s) => `${s.date},${s.quantity}`).join("\n");

  let r = await fetch(BASE + "/");
  check(r.status === 200 && (await r.text()).includes("Lumen-X"), "the static page opens");
  r = await call(null, "GET", "/api/me");
  check(r.status === 401, `no token: ${r.status} (expected 401)`);
  r = await call("alice@example.com", "GET", "/api/me");
  check(r.status === 200 && r.data.email === "alice@example.com", "valid token: /api/me");

  r = await call("alice@example.com", "POST", "/api/products", { name: "Bread" });
  check(r.status === 201, "creates a product");
  const id = r.data.id;

  const form = new FormData();
  form.set("file", new File([csv], "bread.csv", { type: "text/csv" }));
  let t0 = Date.now();
  r = await call("alice@example.com", "POST", `/api/products/${id}/sales/import`, form);
  check(r.status === 200 && r.data.inserted === sales.length && r.data.rejected === 0, `imports ${sales.length} days in ${Date.now() - t0} ms`);

  t0 = Date.now();
  r = await call("alice@example.com", "POST", `/api/products/${id}/forecast`, { horizon: 28 });
  check(r.status === 201 && r.data.methodUsed === "ets" && r.data.forecast.length === 28, `forecast in ${Date.now() - t0} ms (method ${r.data?.methodUsed})`);
  r = await call("alice@example.com", "GET", `/api/products/${id}/reorder?serviceLevel=95`);
  check(r.status === 200 && r.data.orderUpToLevel > 0, "reorder suggestion");

  check((await call("bob@example.com", "GET", `/api/products/${id}`)).status === 404, "another user cannot see the product");
  check((await call("bob@example.com", "GET", `/api/products/${id}/sales`)).status === 404, "nor its sales");

  const cross = await fetch(BASE + "/api/products", {
    method: "POST",
    headers: { "cf-access-jwt-assertion": await token("alice@example.com"), origin: "https://evil.example", "content-type": "application/json" },
    body: '{"name":"x"}',
  });
  check(cross.status === 403, `cross-site POST: ${cross.status} (expected 403)`);

  const parts = (await token("alice@example.com")).split(".");
  parts[2] = parts[2].slice(0, -4) + "AAAA";
  r = await fetch(BASE + "/api/me", { headers: { "cf-access-jwt-assertion": parts.join(".") } });
  check(r.status === 401, `tampered token: ${r.status} (expected 401)`);
} finally {
  stop();
}
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
