import datetime as dt

import numpy as np
import pandas as pd

from .models import METHODS, lightgbm_ok

Z80 = 1.2816   # 80% two-sided interval

BACKTEST_FOLDS = 3      # consecutive backtest windows, starting from the most recent
MIN_FOLD_TRAIN = 28     # minimum training days for any window


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


def _scores(err: np.ndarray) -> dict[str, float]:
    return {"mae": float(np.mean(np.abs(err))), "rmse": float(np.sqrt(np.mean(err**2)))}


def predict(method: str, y: pd.Series, h: int) -> np.ndarray:
    """Forecast h days with one method. "blend" is the simple mean of ETS and LightGBM."""
    if method == "blend":
        return (METHODS["ets"](y, h) + METHODS["lightgbm"](y, h)) / 2
    return METHODS[method](y, h)


def fold_cuts(n: int, k: int) -> list[int]:
    """Cut points of the backtest windows, most recent first.

    Window i trains on y[:cut] and is scored on the k days after the cut. Windows do not overlap.
    A window is dropped when it would leave less than MIN_FOLD_TRAIN days of training.
    """
    cuts = []
    for i in range(BACKTEST_FOLDS):
        cut = n - k * (i + 1)
        if cut < MIN_FOLD_TRAIN:
            break
        cuts.append(cut)
    return cuts


def backtest(
    y: pd.Series, h: int, methods: list[str], cuts: list[int] | None = None
) -> tuple[int, dict[str, dict[str, float]]]:
    """Score every method on several consecutive windows of k days and pool the errors.

    A single window can be lucky or unlucky, so the method is chosen on all windows together.
    A method that fails on any window is excluded, so all methods are compared on the same windows.
    """
    k = holdout_size(len(y), h)
    if cuts is None:
        cuts = fold_cuts(len(y), k) or [len(y) - k]

    errors: dict[str, list[np.ndarray]] = {m: [] for m in methods}
    failed: set[str] = set()
    for cut in cuts:
        train, test = y.iloc[:cut], y.iloc[cut:cut + k].to_numpy()
        for m in methods:
            if m in failed:
                continue
            try:
                pred = METHODS[m](train, k)
            except Exception as exc:            # a failing method must not break "auto"
                if len(methods) == 1:
                    raise SeriesError(f"method '{m}' failed: {exc}") from exc
                failed.add(m)
                continue
            errors[m].append(test - pred)

    out: dict[str, dict[str, float]] = {}
    for m, errs in errors.items():
        if m in failed or not errs:
            continue
        out[m] = _scores(np.concatenate(errs))

    # The blend (mean of ETS and LightGBM) needs no extra fits: the error of a mean of two
    # forecasts is the mean of their errors.
    if "ets" in out and "lightgbm" in out:
        out["blend"] = _scores(np.concatenate([(a + b) / 2 for a, b in zip(errors["ets"], errors["lightgbm"])]))
    if not out:
        raise SeriesError("no method could be fitted on this series")
    return k, out


def run_forecast(dates: list[dt.date], values: list[float], h: int, method: str) -> dict:
    y, filled = prepare_series(dates, values)
    n = len(y)
    k = holdout_size(n, h)
    cuts = fold_cuts(n, k) or [n - k]
    lgbm_possible = lightgbm_ok(n, h) and lightgbm_ok(cuts[0], k)

    if method == "auto":
        candidates = ["naive", "ets"] + (["lightgbm"] if lgbm_possible else [])
    elif method == "blend":
        if not lgbm_possible:
            raise SeriesError("not enough history for the blend of ets and lightgbm: use more data or a shorter horizon")
        candidates = ["ets", "lightgbm"]
    else:
        candidates = [method]
        if method == "lightgbm" and not lgbm_possible:
            raise SeriesError("not enough history for lightgbm: use more data or a shorter horizon")

    if "lightgbm" in candidates:
        cuts = [c for c in cuts if lightgbm_ok(c, k)]   # same windows for every method

    k, metrics = backtest(y, h, candidates, cuts)
    if method == "auto":
        # With enough history "auto" is the blend: on real series the mean of ETS and LightGBM was
        # never far from the best single method, while choosing between them added noise.
        chosen = "blend" if "blend" in metrics else min(metrics, key=lambda m: metrics[m]["rmse"])
    elif method == "blend":
        if "blend" not in metrics:
            raise SeriesError("method 'blend' failed: ets or lightgbm could not be fitted")
        chosen = "blend"
    else:
        chosen = min(metrics, key=lambda m: metrics[m]["rmse"])

    try:
        pred = predict(chosen, y, h)
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
