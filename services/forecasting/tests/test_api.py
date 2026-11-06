import datetime as dt

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_series(n=200, start=dt.date(2024, 1, 1), seed=0):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    values = 100 + 0.1 * t + 15 * np.sin(2 * np.pi * (t % 7) / 7) + rng.normal(0, 3, n)
    return [{"date": (start + dt.timedelta(days=int(i))).isoformat(), "value": float(v)}
            for i, v in zip(t, values)]


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("method", ["auto", "naive", "ets", "lightgbm", "blend"])
def test_forecast_methods(method):
    series = make_series()
    r = client.post("/forecast", json={"series": series, "horizon": 14, "method": method})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["forecast"]) == 14
    assert body["method_used"] == method or method == "auto"
    last = dt.date.fromisoformat(series[-1]["date"])
    assert body["forecast"][0]["date"] == (last + dt.timedelta(days=1)).isoformat()
    for p in body["forecast"]:
        assert p["lower"] <= p["yhat"] <= p["upper"]


def test_auto_reports_backtest_for_each_candidate():
    body = client.post("/forecast", json={"series": make_series(), "horizon": 14}).json()
    assert {"naive", "ets", "lightgbm"} <= set(body["backtest"])


def test_short_history_skips_lightgbm_in_auto():
    body = client.post("/forecast", json={"series": make_series(60), "horizon": 14}).json()
    assert "lightgbm" not in body["backtest"]


def test_lightgbm_explicit_with_short_history_is_422():
    r = client.post("/forecast", json={"series": make_series(60), "horizon": 14, "method": "lightgbm"})
    assert r.status_code == 422


def test_too_short_series_is_422():
    r = client.post("/forecast", json={"series": make_series(10), "horizon": 7})
    assert r.status_code == 422


def test_duplicate_dates_is_422():
    series = make_series()
    series.append(series[0])
    r = client.post("/forecast", json={"series": series, "horizon": 7})
    assert r.status_code == 422


def test_missing_days_are_interpolated():
    series = make_series()
    del series[50:53]
    body = client.post("/forecast", json={"series": series, "horizon": 7}).json()
    assert body["filled_missing_days"] == 3


def test_forecast_is_not_negative_for_non_negative_history():
    series = make_series()
    for p in series:
        p["value"] = max(0.0, p["value"] - 95)   # lots of values near zero
    body = client.post("/forecast", json={"series": series, "horizon": 14}).json()
    assert all(p["lower"] >= 0 and p["yhat"] >= 0 for p in body["forecast"])


def test_invalid_horizon_is_422():
    r = client.post("/forecast", json={"series": make_series(), "horizon": 0})
    assert r.status_code == 422
