import datetime as dt

import numpy as np
import pandas as pd

from .models import METHODS, lightgbm_ok

Z80 = 1.2816   # 80% two-sided interval


class SeriesError(ValueError):
    """The input series or the requested method cannot be used."""


def prepare_series(dates: list[dt.date], values: list[float]) -> tuple[pd.Series, int]:
    s = pd.Series(values, index=pd.to_datetime(dates), dtype=float)
    if s.index.duplicated().any():
        raise SeriesError("duplicate dates in series")
    if not np.isfinite(s.to_numpy()).all():
        raise SeriesError("series contains non-finite values")
    s = s.sort_index()
    full = pd.date_range(s.index.min(), s.index.max(), freq="D")
    s = s.reindex(full)
    filled = int(s.isna().sum())
    if filled > 0.2 * len(s):
        raise SeriesError(f"too many missing days ({filled} of {len(s)})")
    return s.interpolate(limit_direction="both"), filled


def holdout_size(n: int, h: int) -> int:
    return min(h, n // 4)


def backtest(y: pd.Series, h: int, methods: list[str]) -> tuple[int, dict[str, dict[str, float]]]:
    """Fit on all but the last k days and score the forecast on those k days."""
    k = holdout_size(len(y), h)
    train, test = y.iloc[:-k], y.iloc[-k:].to_numpy()
    out: dict[str, dict[str, float]] = {}
    for m in methods:
        try:
            pred = METHODS[m](train, k)
        except Exception as exc:            # a failing method must not break "auto"
            if len(methods) == 1:
                raise SeriesError(f"method '{m}' failed: {exc}") from exc
            continue
        err = test - pred
        out[m] = {"mae": float(np.mean(np.abs(err))), "rmse": float(np.sqrt(np.mean(err**2)))}
    if not out:
        raise SeriesError("no method could be fitted on this series")
    return k, out


def run_forecast(dates: list[dt.date], values: list[float], h: int, method: str) -> dict:
    y, filled = prepare_series(dates, values)
    k = holdout_size(len(y), h)
    lgbm_possible = lightgbm_ok(len(y), h) and lightgbm_ok(len(y) - k, k)

    if method == "auto":
        candidates = ["naive", "ets"] + (["lightgbm"] if lgbm_possible else [])
    else:
        candidates = [method]
        if method == "lightgbm" and not lgbm_possible:
            raise SeriesError("not enough history for lightgbm: use more data or a shorter horizon")

    k, metrics = backtest(y, h, candidates)
    chosen = min(metrics, key=lambda m: metrics[m]["rmse"])

    try:
        pred = METHODS[chosen](y, h)
    except Exception as exc:
        raise SeriesError(f"method '{chosen}' failed: {exc}") from exc

    band = Z80 * metrics[chosen]["rmse"]
    lower, upper = pred - band, pred + band
    if bool((y >= 0).all()):                 # sales cannot be negative
        pred, lower, upper = (np.clip(a, 0, None) for a in (pred, lower, upper))

    dates_out = pd.date_range(y.index[-1] + pd.Timedelta(days=1), periods=h, freq="D")
    return {
        "method_used": chosen,
        "horizon": h,
        "holdout_days": k,
        "filled_missing_days": filled,
        "backtest": metrics,
        "forecast": [
            {"date": d.date(), "yhat": float(p), "lower": float(lo), "upper": float(up)}
            for d, p, lo, up in zip(dates_out, pred, lower, upper)
        ],
    }
