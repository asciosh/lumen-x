// End-to-end check in the real Cloudflare Workers runtime (workerd), on your machine, with nothing deployed:
//   npm run e2e
// It starts the Worker locally with a local D1 database. A small local server plays the role of GitHub (the sign-in page,
// the token exchange and the user lookup), so the whole login flow runs for real, and the API is called with the real Bread
// series of docs/data/sales.json. Nothing leaves your machine.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8799";
const GITHUB = "http://127.0.0.1:9912";
const LLM = "http://127.0.0.1:9913";
const SECRET = "e2e-session-secret-".padEnd(48, "x");
const USERS = { alice: { id: 1, login: "alice" }, bob: { id: 2, login: "bob" }, mallory: { id: 3, login: "mallory" } };
const root = new URL("..", import.meta.url).pathname;

let failures = 0;
const check = (condition, message) => {
  console.log(`${condition ? "OK  " : "FAIL"} ${message}`);
  if (!condition) failures++;
};

// If a previous run left a Worker alive, the ports are taken and the results would be those of the old Worker.
if (await fetch(BASE + "/").then(() => true, () => false)) {
  console.error("Port 8799 is already in use: a previous run is still alive. Stop it (for example: pkill -x workerd) and try again.");
  process.exit(1);
}

// A stand-in for GitHub. `nextUser` is who "types the password" on the stand-in sign-in page.
let nextUser = "alice";
const readBody = (req) => new Promise((resolve) => { let data = ""; req.on("data", (c) => (data += c)); req.on("end", () => resolve(data)); });
const github = http
  .createServer(async (req, res) => {
    const url = new URL(req.url, GITHUB);
    if (url.pathname === "/login/oauth/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", `code-${nextUser}`);
      back.searchParams.set("state", url.searchParams.get("state"));
      res.writeHead(302, { location: back.toString() }).end();
    } else if (url.pathname === "/login/oauth/access_token") {
      const { code } = JSON.parse(await readBody(req));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ access_token: `token-for-${code.replace("code-", "")}` }));
    } else if (url.pathname === "/user") {
      const user = USERS[String(req.headers.authorization).replace("Bearer token-for-", "")];
      res.writeHead(user ? 200 : 401, { "content-type": "application/json" }).end(JSON.stringify(user ?? {}));
    } else {
      res.writeHead(404).end();
    }
  })
  .on("error", (error) => {
    console.error(`Cannot start the GitHub stand-in on port 9912: ${error.message}`);
    process.exit(1);
  })
  .listen(9912);

// A stand-in for an AI provider (OpenAI-compatible). `llmMode` decides what it answers; it remembers what it received.
let llmMode = "good";
const llmSeen = { calls: 0, body: "", authorization: "" };
const llm = http
  .createServer(async (req, res) => {
    const body = await readBody(req);
    llmSeen.calls++;
    llmSeen.body = body;
    llmSeen.authorization = String(req.headers.authorization);
    if (llmMode === "error") return res.writeHead(500).end("{}");
    if (llmMode === "rate") return res.writeHead(429, { "retry-after": "60" }).end("{}");
    const user = JSON.parse(body).messages[1].content;
    const facts = JSON.parse(user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1));
    const italian = user.includes("in Italian");
    const total = Math.round(facts.forecastTotal).toLocaleString(italian ? "it-IT" : "en-US");
    const content =
      llmMode === "invented"
        ? "[[PRODUCT]] will grow 35% next month."
        : italian
          ? `Per [[PRODUCT]] prevedo circa ${total} unità su ${facts.horizon} giorni.`
          : `For [[PRODUCT]] I forecast about ${total} units over ${facts.horizon} days.`;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ choices: [{ message: { content } }] }));
  })
  .on("error", (error) => {
    console.error(`Cannot start the AI stand-in on port 9913: ${error.message}`);
    process.exit(1);
  })
  .listen(9913);

// A fresh, temporary local database every time, with the real schema: the run never depends on a previous one.
const state = mkdtempSync(join(tmpdir(), "lumenx-e2e-"));

// The real configuration, without the Workers AI binding (it only works against the real Cloudflare), with absolute paths.
const wrangler = JSON.parse(readFileSync(join(root, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
delete wrangler.ai;
wrangler.main = join(root, wrangler.main);
wrangler.assets.directory = join(root, wrangler.assets.directory);
const configFile = join(state, "wrangler.e2e.json");
writeFileSync(configFile, JSON.stringify(wrangler));

for (const file of readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  const schema = spawnSync("npx", ["wrangler", "d1", "execute", "lumenx", "--local", "--config", configFile, "--persist-to", state, `--file=migrations/${file}`], {
    cwd: root,
    encoding: "utf8",
  });
  if (schema.status !== 0) {
    console.error(`Could not create the local database (${file}):\n` + schema.stdout + schema.stderr);
    github.close();
    llm.close();
    process.exit(1);
  }
}
const vars = {
  SESSION_SECRET: SECRET,
  GITHUB_CLIENT_ID: "e2e-client",
  GITHUB_CLIENT_SECRET: "e2e-client-secret",
  ALLOWED_GITHUB_USERS: "alice, bob",
  GITHUB_URL: GITHUB,
  GITHUB_API_URL: GITHUB,
  GROQ_API_KEY: "e2e-llm-key",
  GROQ_MODEL: "e2e-model",
  LLM_URL_GROQ: `${LLM}/v1`,
};
const worker = spawn(
  "npx",
  ["wrangler", "dev", "--local", "--config", configFile, "--port", "8799", "--persist-to", state, ...Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`])],
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
  github.close();
  llm.close();
  rmSync(state, { recursive: true, force: true });
};
process.on("exit", stop);

/** The whole login: Worker -> (stand-in) GitHub -> Worker. Returns the status of the last step and the session cookie, if any. */
async function signIn(user, { state: stateOverride } = {}) {
  nextUser = user;
  let r = await fetch(BASE + "/auth/login", { redirect: "manual" });
  const stateCookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  r = await fetch(r.headers.get("location"), { redirect: "manual" });
  const back = new URL(r.headers.get("location"));
  if (stateOverride) back.searchParams.set("state", stateOverride);
  r = await fetch(back, { redirect: "manual", headers: { cookie: stateCookie } });
  const raw = r.headers.getSetCookie().find((c) => c.startsWith("lumenx_session=") && !c.startsWith("lumenx_session=;"));
  return { status: r.status, location: r.headers.get("location"), raw, cookie: raw ? raw.split(";")[0] : null };
}

async function call(cookie, method, path, body, extraHeaders = {}) {
  const headers = { ...(cookie ? { cookie } : {}), ...extraHeaders };
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
  check(r.status === 200 && (await r.text()).includes("Lumen-X"), "the static page opens (it is public: it holds no data)");
  check((await call(null, "GET", "/api/me")).status === 401, "no session: the API answers 401");

  const alice = await signIn("alice");
  check(alice.status === 302 && alice.location === "/" && alice.cookie !== null, "alice signs in through GitHub and gets a session");
  check(/HttpOnly/.test(alice.raw) && /Secure/.test(alice.raw) && /SameSite=Lax/.test(alice.raw), "the session cookie is HttpOnly, Secure and SameSite=Lax");
  check(JSON.stringify((await call(alice.cookie, "GET", "/api/me")).data) === '{"login":"alice"}', "/api/me says who she is");

  r = await call(alice.cookie, "POST", "/api/products", { name: "Bread" });
  check(r.status === 201, `creates a product (status ${r.status}${r.data?.detail ? ": " + r.data.detail : ""})`);
  if (r.status !== 201) {
    throw new Error("cannot go on without a product");
  }
  const id = r.data.id;

  const form = new FormData();
  form.set("file", new File([csv], "bread.csv", { type: "text/csv" }));
  let t0 = Date.now();
  r = await call(alice.cookie, "POST", `/api/products/${id}/sales/import`, form);
  check(r.status === 200 && r.data.inserted === sales.length && r.data.rejected === 0, `imports ${sales.length} days in ${Date.now() - t0} ms`);

  t0 = Date.now();
  r = await call(alice.cookie, "POST", `/api/products/${id}/forecast`, { horizon: 28 });
  check(r.status === 201 && r.data.methodUsed === "ets" && r.data.forecast.length === 28, `forecast in ${Date.now() - t0} ms (method ${r.data?.methodUsed})`);
  r = await call(alice.cookie, "GET", `/api/products/${id}/reorder?serviceLevel=95`);
  check(r.status === 200 && r.data.orderUpToLevel > 0, "reorder suggestion");
  r = await call(alice.cookie, "GET", `/api/products/${id}/summary?onHand=1000`);
  check(
    r.status === 200 && r.data.sales.days === 28 && r.data.order.periodDays === 14 && r.data.order.suggestedOrder > 0 && ["high", "medium", "low", "very_low"].includes(r.data.trust.level) && r.data.orderError === null,
    `summary: ${r.data?.sales?.days} days, order ${r.data?.order?.suggestedOrder}, trust ${r.data?.trust?.level}`,
  );

  // ---- "Rewrite with AI": the real Worker, the real database, a stand-in provider ----
  const rewrite = (cookie, lang = "en") => call(cookie, "POST", `/api/products/${id}/forecast/explanation/ai?lang=${lang}`);
  r = await call(alice.cookie, "GET", "/api/ai");
  const limit = r.data.dailyLimit; // the daily limit of AI rewrites, as the Worker states it
  check(r.data.enabled === true && r.data.providers[0].id === "groq" && r.data.remaining === limit && limit > 3, `AI status: on, one provider, ${limit} rewrites left`);
  r = await rewrite(alice.cookie);
  check(r.status === 200 && r.data.source === "ai" && r.data.provider === "groq" && r.data.text.includes("For Bread I forecast about"), `AI rewrite works, with the real product name: "${r.data?.text}"`);
  check(!llmSeen.body.includes("Bread") && !llmSeen.body.includes("date,quantity") && llmSeen.authorization === "Bearer e2e-llm-key", "the provider received no product name and no sales rows, and the key only in the header");
  llmMode = "invented";
  r = await rewrite(alice.cookie);
  check(r.data.source === "template" && r.data.note === "ai_rejected", "an AI text with invented figures is discarded");
  llmMode = "good";
  r = await rewrite(alice.cookie, "it");
  check(r.data.source === "ai" && r.data.text.startsWith("Per Bread prevedo circa"), "Italian rewrite works");
  let last;
  // three done so far (the good one, the discarded one and the Italian one): the others reach the limit
  for (let i = 0; i < limit - 3; i++) last = await rewrite(alice.cookie);
  check(last.status === 200 && last.data.remaining === 0, `${limit} rewrites a day are allowed`);
  r = await rewrite(alice.cookie);
  check(r.status === 429, `the next one is refused: ${r.status}`);

  const bob = await signIn("bob");
  check(bob.cookie !== null, "bob signs in");
  check((await call(bob.cookie, "GET", `/api/products/${id}`)).status === 404, "bob cannot see alice's product");
  check((await call(bob.cookie, "GET", `/api/products/${id}/sales`)).status === 404, "nor its sales");
  check(JSON.stringify((await call(bob.cookie, "GET", "/api/products")).data) === "[]", "bob's list is empty");
  check((await call(bob.cookie, "GET", "/api/ai")).data.remaining === limit, "bob has his own count of AI rewrites");
  // a provider that fails is left alone for a while (the pause is kept in the database)
  const bobProduct = (await call(bob.cookie, "POST", "/api/products", { name: "Pasta" })).data.id;
  const bobForm = new FormData();
  bobForm.set("file", new File([csv], "pasta.csv", { type: "text/csv" }));
  await call(bob.cookie, "POST", `/api/products/${bobProduct}/sales/import`, bobForm);
  await call(bob.cookie, "POST", `/api/products/${bobProduct}/forecast`, { horizon: 28 });
  llmMode = "error";
  const before = llmSeen.calls;
  r = await call(bob.cookie, "POST", `/api/products/${bobProduct}/forecast/explanation/ai?lang=en`);
  check(r.data.source === "template" && r.data.note === "ai_unavailable" && r.data.remaining === limit, "a failing provider: the text written by the app, and no rewrite used");
  llmMode = "good";
  const afterFail = llmSeen.calls;
  r = await call(bob.cookie, "POST", `/api/products/${bobProduct}/forecast/explanation/ai?lang=en`);
  check(afterFail === before + 1 && llmSeen.calls === afterFail && r.data.note === "ai_unavailable", "the failed provider is paused: it is not called again");

  const mallory = await signIn("mallory");
  check(mallory.status === 403 && mallory.cookie === null, `mallory (not on the list) is refused: ${mallory.status}, no session`);
  const forged = await signIn("alice", { state: "forged-state" });
  check(forged.status === 400 && forged.cookie === null, `a forged sign-in (wrong state) is refused: ${forged.status}`);

  const parts = alice.cookie.split(".");
  parts[2] = parts[2].slice(0, -4) + "AAAA";
  check((await call(parts.join("."), "GET", "/api/me")).status === 401, "a tampered cookie is refused");
  check((await call(alice.cookie, "POST", "/api/products", { name: "x" }, { origin: "https://evil.example" })).status === 403, "a cross-site POST is refused");

  const out = await fetch(BASE + "/auth/logout", { method: "POST" });
  check(out.status === 204 && out.headers.getSetCookie().some((c) => c.startsWith("lumenx_session=;") && c.includes("Max-Age=0")), "sign-out clears the cookie");
} catch (error) {
  failures++;
  console.log(`FAIL ${error.message}`);
} finally {
  stop();
}
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
