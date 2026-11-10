#!/usr/bin/env bash
# Checks that a Lumen-X development environment (for example a Codespace) is healthy.
# It only reads: it changes nothing in your files.
#
#   bash scripts/check_dev.sh            quick checks (a few seconds)
#   bash scripts/check_dev.sh --tests    also runs every test suite (a few minutes)
cd "$(dirname "$0")/.." || exit 1

RUN_TESTS=0
[ "${1:-}" = "--tests" ] && RUN_TESTS=1

pass=0
fail=0
warn=0

ok()   { echo "OK    $1"; pass=$((pass + 1)); }
bad()  { echo "FAIL  $1"; [ -n "${2:-}" ] && echo "        $2"; fail=$((fail + 1)); }
note() { echo "WARN  $1"; [ -n "${2:-}" ] && echo "        $2"; warn=$((warn + 1)); }

# check "what" command args...   ->  OK if the command succeeds, FAIL (with its last lines) if not
check() {
  local label="$1"
  shift
  local out
  if out=$("$@" 2>&1); then
    ok "$label"
  else
    bad "$label" "$(echo "$out" | tail -n 3 | cut -c1-170 | tr '\n' ' ')"
  fi
}

echo "== Repository =="
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ]; then ok "branch is main"; else note "branch is '$branch', not main"; fi

if git fetch -q origin 2>/dev/null; then
  read -r behind ahead < <(git rev-list --left-right --count origin/main...HEAD)
  if [ "$behind" -eq 0 ] && [ "$ahead" -eq 0 ]; then
    ok "up to date with origin/main ($(git rev-parse --short HEAD))"
  else
    [ "$behind" -gt 0 ] && note "$behind commit(s) on GitHub that you do not have" "run: git pull"
    [ "$ahead" -gt 0 ] && note "$ahead commit(s) not pushed yet" "run: git push"
  fi
else
  note "could not reach GitHub to compare with origin/main"
fi

changes=$(git status --porcelain | wc -l)
if [ "$changes" -eq 0 ]; then
  ok "no uncommitted changes"
else
  note "$changes file(s) changed and not committed" "$(git status --porcelain | head -n 5 | tr '\n' ' ')"
fi

echo
echo "== Tools =="
dotnet_version=$(dotnet --version 2>/dev/null)
case "$dotnet_version" in
  10.*) ok "dotnet $dotnet_version" ;;
  "")   bad "dotnet is not installed" "it comes from the 'dotnet' feature of .devcontainer/devcontainer.json: rebuild the container" ;;
  *)    bad "dotnet $dotnet_version (version 10 is needed)" ;;
esac

node_version=$(node --version 2>/dev/null)
node_major=${node_version#v}
node_major=${node_major%%.*}
if [ -z "$node_version" ]; then
  bad "node is not installed" "it comes from the 'node' feature of .devcontainer/devcontainer.json: rebuild the container"
elif [ "$node_major" -ge 22 ] 2>/dev/null; then
  ok "node $node_version"
else
  bad "node $node_version (version 22 or newer is needed)"
fi

check "python3 is installed" python3 --version
docker_ok=0
if docker info >/dev/null 2>&1; then
  docker_ok=1
  ok "docker is running"
else
  bad "docker is not available" "rebuild the container, or run: docker info"
fi

echo
echo "== Cloudflare edition =="
if grep -Eq '"database_id": "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"' cloudflare/wrangler.jsonc 2>/dev/null; then
  ok "wrangler.jsonc has a real D1 database id"
else
  bad "wrangler.jsonc still has the placeholder instead of the D1 database id" "put the id of the 'lumenx' database in cloudflare/wrangler.jsonc"
fi
if [ -d cloudflare/node_modules ]; then
  ok "cloudflare/node_modules is installed"
else
  note "cloudflare/node_modules is missing" "run: cd cloudflare && npm install"
fi

echo
echo "== Services (docker compose) =="
if [ "$docker_ok" -eq 1 ]; then
  running=$(docker compose ps --status running --services 2>/dev/null)
  for service in db forecasting backend dashboard; do
    if echo "$running" | grep -qx "$service"; then ok "$service is running"; else bad "$service is not running" "run: docker compose up -d --build"; fi
  done
  check "forecasting answers on port 8000" curl -fsS -m 5 http://localhost:8000/health
  check "backend answers on port 8080" curl -fsS -m 5 http://localhost:8080/health
  check "dashboard answers on port 8081" curl -fsS -m 10 -o /dev/null http://localhost:8081/
  if curl -fsS -m 5 http://localhost:8080/products 2>/dev/null | grep -q '"name"'; then
    ok "there is at least one product (sample data loaded)"
  else
    note "no products yet" "run: bash scripts/seed_demo.sh"
  fi
else
  note "services not checked (docker is not available)"
fi

if [ "$RUN_TESTS" -eq 1 ]; then
  echo
  echo "== Tests (this takes a few minutes) =="
  check "backend tests (dotnet)" dotnet test backend/tests/LumenX.Api.Tests --nologo -v q
  check "dashboard tests (dotnet)" dotnet test dashboard/tests/LumenX.Dashboard.Tests --nologo -v q
  check "Cloudflare edition: tests" bash -c 'cd cloudflare && npm test --silent'
  check "Cloudflare edition: type check" bash -c 'cd cloudflare && npm run typecheck --silent'
  check "Cloudflare edition: end-to-end in the Workers runtime" bash -c 'cd cloudflare && npm run e2e --silent'
fi

echo
echo "Passed: $pass   Warnings: $warn   Failed: $fail"
[ "$fail" -eq 0 ]
