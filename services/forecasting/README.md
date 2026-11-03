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
2. The last `min(horizon, n/4)` days are held out. Every candidate model is fitted on the rest and scored (MAE, RMSE) on the holdout.
3. With `method=auto` the lowest RMSE wins; the winner is refitted on the full history and forecasts the horizon.
4. The prediction interval is `yhat ± 1.28 x holdout RMSE`. It is an approximation, constant across the horizon, not a calibrated probabilistic forecast.
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
