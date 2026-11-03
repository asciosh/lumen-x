"""Writes sample_request.json: 200 days of synthetic daily sales.

Usage:  python examples/make_sample_request.py
        curl -X POST localhost:8000/forecast -H "Content-Type: application/json" -d @sample_request.json
"""
import datetime as dt
import json

import numpy as np

rng = np.random.default_rng(42)
n = 200
t = np.arange(n)
values = 100 + 0.1 * t + 15 * np.sin(2 * np.pi * (t % 7) / 7) + rng.normal(0, 3, n)
start = dt.date(2025, 1, 1)

payload = {
    "horizon": 14,
    "method": "auto",
    "series": [
        {"date": (start + dt.timedelta(days=int(i))).isoformat(), "value": round(float(v), 2)}
        for i, v in zip(t, values)
    ],
}
with open("sample_request.json", "w") as f:
    json.dump(payload, f)
print("wrote sample_request.json")
