// End-to-end check in the real Cloudflare Workers runtime (workerd), on your machine, with nothing deployed:
//   npm run e2e
// It starts the Worker locally with a local D1 database, signs login tokens with a throwaway key (a small local server
// plays the role of Cloudflare Access), and calls the API with the real Bread series of docs/data/sales.json.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
// If a previous run left a Worker alive, the ports are taken and the results would be those of the old Worker.
if (await fetch(BASE + "/").then(() => true, () => false)) {
  console.error("Port 8799 is already in use: a previous run is still alive. Stop it (for example: pkill -x workerd) and try again.");
  process.exit(1);
}
const accessStandIn = http
  .createServer((_, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  })
  .on("error", (error) => {
    console.error(`Cannot start the Access stand-in on port 9911: ${error.message}`);
    process.exit(1);
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

// A fresh, temporary local database every time, with the real schema: the run never depends on a previous one.
const state = mkdtempSync(join(tmpdir(), "lumenx-e2e-"));
const schema = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "lumenx", "--local", "--persist-to", state, "--file=migrations/0001_init.sql"],
  { cwd: root, encoding: "utf8" },
);
if (schema.status !== 0) {
  console.error("Could not create the local database:\n" + schema.stdout + schema.stderr);
  process.exit(1);
}
const worker = spawn(
  "npx",
  ["wrangler", "dev", "--local", "--port", "8799", "--persist-to", state, "--var", `ACCESS_TEAM_DOMAIN:${TEAM}`, "--var", `ACCESS_AUD:${AUD}`],
  // Own process group, so that the whole tree (npx, wrangler, workerd) can be stopped together.
  { cwd: root, stdio: "ignore", detached: true },
);
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  try {
    process.kill(-worker.pid, "SIGKILL");
  } catch {
    // already gone
  }
  accessStandIn.close();
  rmSync(state, { recursive: true, force: true });
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
  check(r.status === 201, `creates a product (status ${r.status}${r.data?.detail ? ": " + r.data.detail : ""})`);
  if (r.status !== 201) {
    throw new Error("cannot go on without a product");
  }
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
} catch (error) {
  failures++;
  console.log(`FAIL ${error.message}`);
} finally {
  stop();
}
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
