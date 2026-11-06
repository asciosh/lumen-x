import datetime as dt

import numpy as np
import pandas as pd
import pytest

from app.service import BACKTEST_FOLDS, backtest, fold_cuts, holdout_size, run_forecast

PATTERN = np.array([0.0, 5.0, 10.0, 15.0, 10.0, 5.0, 0.0])


def weekly(n, jump_from=None, jump=50.0):
    """Perfectly weekly series, optionally with a permanent level jump from a given index."""
    t = np.arange(n)
    values = 100 + PATTERN[t % 7] + (jump if jump_from is not None else 0) * (t >= (jump_from or 0))
    return pd.Series(values, index=pd.date_range("2024-01-01", periods=n, freq="D"))


def as_lists(y):
    return [d.date() for d in y.index], [float(v) for v in y.to_numpy()]


def test_fold_cuts_for_long_series_uses_all_folds():
    assert fold_cuts(500, 28) == [472, 444, 416]
    assert len(fold_cuts(500, 28)) == BACKTEST_FOLDS


def test_fold_cuts_drops_windows_without_enough_training_days():
    assert fold_cuts(42, 10) == [32]
    assert fold_cuts(60, 14) == [46, 32]


def test_fold_cuts_windows_do_not_overlap():
    cuts = fold_cuts(200, 28)
    assert all(a - b == 28 for a, b in zip(cuts, cuts[1:]))


def test_perfect_weekly_series_has_zero_naive_error_on_every_window():
    y = weekly(200)
    _, metrics = backtest(y, 28, ["naive"])
    assert metrics["naive"]["mae"] == pytest.approx(0.0, abs=1e-9)
    assert metrics["naive"]["rmse"] == pytest.approx(0.0, abs=1e-9)


def test_errors_from_older_windows_count_in_the_pooled_metrics():
    # level jump at index 144: only the second most recent window (days 144-171) contains it
    y = weekly(200, jump_from=144)
    cuts = fold_cuts(len(y), holdout_size(len(y), 28))
    assert cuts == [172, 144, 116]

    _, last_window_only = backtest(y, 28, ["naive"], cuts=[172])
    _, pooled = backtest(y, 28, ["naive"], cuts=cuts)

    assert last_window_only["naive"]["mae"] == pytest.approx(0.0, abs=1e-9)   # the old behaviour: looks perfect
    assert pooled["naive"]["mae"] == pytest.approx(50.0 / 3, rel=1e-6)        # all three windows: it is not
    assert pooled["naive"]["rmse"] == pytest.approx(np.sqrt(2500.0 / 3), rel=1e-6)


def test_run_forecast_reports_pooled_backtest():
    dates, values = as_lists(weekly(200, jump_from=144))
    body = run_forecast(dates, values, 28, "naive")
    assert body["backtest"]["naive"]["mae"] == pytest.approx(50.0 / 3, rel=1e-6)
    assert body["holdout_days"] == 28


def test_minimum_length_series_still_works_with_a_single_window():
    dates, values = as_lists(weekly(42))
    body = run_forecast(dates, values, 28, "auto")
    assert body["holdout_days"] == 10
    assert {"naive", "ets"} <= set(body["backtest"])
    assert "lightgbm" not in body["backtest"]


def test_lightgbm_is_still_a_candidate_when_there_is_enough_history():
    rng = np.random.default_rng(0)
    y = weekly(250) + rng.normal(0, 2, 250)
    dates, values = as_lists(y)
    body = run_forecast(dates, values, 14, "auto")
    assert {"naive", "ets", "lightgbm"} <= set(body["backtest"])


def test_dates_in_forecast_follow_the_last_day():
    y = weekly(120)
    dates, values = as_lists(y)
    body = run_forecast(dates, values, 7, "naive")
    assert body["forecast"][0]["date"] == y.index[-1].date() + dt.timedelta(days=1)


# ---- blend (mean of ETS and LightGBM) -------------------------------------------------

def noisy_weekly(n=250, seed=0):
    rng = np.random.default_rng(seed)
    return weekly(n) + rng.normal(0, 4, n)


def test_auto_uses_the_blend_when_lightgbm_is_possible():
    dates, values = as_lists(noisy_weekly())
    body = run_forecast(dates, values, 14, "auto")
    assert body["method_used"] == "blend"
    assert {"naive", "ets", "lightgbm", "blend"} <= set(body["backtest"])


def test_blend_forecast_is_the_mean_of_ets_and_lightgbm():
    dates, values = as_lists(noisy_weekly())
    ets = run_forecast(dates, values, 14, "ets")["forecast"]
    lgbm = run_forecast(dates, values, 14, "lightgbm")["forecast"]
    blend = run_forecast(dates, values, 14, "blend")["forecast"]
    for e, g, b in zip(ets, lgbm, blend):
        assert b["yhat"] == pytest.approx((e["yhat"] + g["yhat"]) / 2, abs=1e-9)


def test_blend_backtest_error_is_the_error_of_the_mean_forecast():
    from app.models import METHODS

    y = noisy_weekly()
    k = holdout_size(len(y), 14)
    cuts = fold_cuts(len(y), k)
    _, metrics = backtest(y, 14, ["ets", "lightgbm"], cuts)

    errors = []
    for cut in cuts:
        train, test = y.iloc[:cut], y.iloc[cut:cut + k].to_numpy()
        errors.append(test - (METHODS["ets"](train, k) + METHODS["lightgbm"](train, k)) / 2)
    err = np.concatenate(errors)

    assert metrics["blend"]["mae"] == pytest.approx(float(np.mean(np.abs(err))), rel=1e-9)
    assert metrics["blend"]["rmse"] == pytest.approx(float(np.sqrt(np.mean(err**2))), rel=1e-9)


def test_interval_of_the_blend_uses_the_blend_rmse():
    from app.service import Z80

    dates, values = as_lists(noisy_weekly())
    body = run_forecast(dates, values, 14, "auto")
    half_width = Z80 * body["backtest"]["blend"]["rmse"]
    p = body["forecast"][3]
    assert p["upper"] - p["yhat"] == pytest.approx(half_width, rel=1e-6) or p["lower"] == 0.0


def test_short_history_auto_does_not_use_the_blend():
    dates, values = as_lists(weekly(60))
    body = run_forecast(dates, values, 14, "auto")
    assert body["method_used"] in {"naive", "ets"}
    assert "blend" not in body["backtest"]


def test_explicit_blend_with_short_history_is_an_error():
    from app.service import SeriesError

    dates, values = as_lists(weekly(60))
    with pytest.raises(SeriesError):
        run_forecast(dates, values, 14, "blend")
