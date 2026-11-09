#!/usr/bin/env bash
# Loads sample data into a RUNNING Lumen-X stack: one product, 240 days of synthetic sales and a forecast,
# so a fresh start (for example a new GitHub Codespace) shows something straight away.
# Safe to run twice: if the sample product already exists, it does nothing.
set -euo pipefail

BASE="${BASE:-http://localhost:8080}"
cd "$(dirname "$0")/.."

echo "Waiting for the backend at $BASE ..."
for attempt in $(seq 1 120); do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 120 ]; then
    echo "The backend did not start in time. Check: docker compose ps" >&2
    exit 1
  fi
  sleep 3
done

if curl -fsS "$BASE/products" | python3 -c "import sys, json; sys.exit(0 if any(p['name'] == 'Sample bread' for p in json.load(sys.stdin)) else 1)"; then
  echo "Sample data already present."
  exit 0
fi

ID=$(curl -fsS -X POST "$BASE/products" -H 'Content-Type: application/json' \
      -d '{"name":"Sample bread","sku":"SAMPLE-1"}' | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")

python3 backend/scripts/generate_sample_csv.py --days 240 --out /tmp/sample_sales.csv
curl -fsS -X POST "$BASE/products/$ID/sales/import" -F "file=@/tmp/sample_sales.csv" >/dev/null
echo "Computing the forecast (the first run can take a minute) ..."
curl -fsS -X POST "$BASE/products/$ID/forecast" -H 'Content-Type: application/json' -d '{}' >/dev/null

echo "Done: product $ID has sales and a forecast. Open the dashboard on port 8081."
