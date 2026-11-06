# Forecasting service

FastAPI service that turns a daily sales history into a forecast. Part of [Lumen-X](../../README.md).

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| POST | `/forecast` | Forecast the next `horizon` days |

Interactive docs: `http://localhost:8000/docs`.

### `POST /forecast`

```json
{
  "series": [{"date": "2025-01-01", "value": 103.2}, "... at least 42 daily points"],
  "horizon": 28,
  "method": "auto"
}
```

- `horizon`: 1 to 90 days (default 28).
- `method`: `auto` (default), `naive`, `ets` or `lightgbm`.
- Missing days are interpolated (reported in `filled_missing_days`); more than 20% missing is rejected.

Response (abridged):

```json
{
  "method_used": "ets",
  "horizon": 28,
  "holdout_days": 28,
  "filled_missing_days": 0,
  "interval": "approx. 80% (holdout RMSE)",
  "backtest": {"naive": {"mae": 9.1, "rmse": 11.2}, "ets": {"mae": 6.4, "rmse": 8.1}},
  "forecast": [{"date": "2025-07-20", "yhat": 118.4, "lower": 108.0, "upper": 128.8}]
}
```

## How it works

1. The series is sorted, gaps are interpolated.
2. Backtest on up to 3 consecutive, non-overlapping windows of `k = min(horizon, n/4)` days, ending at the end of the history (a window is dropped if it would leave fewer than 28 training days; short series use just one). Every candidate model is fitted on the days before each window and scored (MAE, RMSE) on the window; errors are pooled across windows. A single window can be lucky, so the choice is made on all of them together. `holdout_days` is the size `k` of each window.
3. With `method=auto` and enough history for LightGBM, the forecast is the **blend**: the simple mean of the ETS and LightGBM forecasts (`method_used` is `blend`). On real series this was never far from the best single method, while choosing between them added noise. With shorter history, `auto` picks the lower pooled RMSE between naive and ETS. Any method can also be requested explicitly (`naive`, `ets`, `lightgbm`, `blend`).
4. The prediction interval is `yhat ± 1.28 x pooled backtest RMSE` of the method used (for the blend, the RMSE of the mean forecast). It is an approximation, constant across the horizon, not a calibrated probabilistic forecast.
5. If the history never goes below zero, forecasts and bounds are clipped at zero.

Models: seasonal naive (repeat last week), additive Holt-Winters with damped trend (statsmodels), and LightGBM with calendar and lag features (all lags at least `horizon` days old, so no leakage). LightGBM needs enough history and is skipped by `auto` otherwise.

## Run

```bash
pip install -r requirements-dev.txt
uvicorn app.main:app --reload      # http://localhost:8000/docs
pytest                             # tests
```

Or with Docker, from the repository root: `docker compose up --build`.

## Limitations

- One series per request, daily frequency only.
- No external regressors (promotions, holidays, weather) yet.
- The global multi-series model from notebook 03 is not served here yet.
