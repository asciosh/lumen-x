# 💡 lumen-x

![Real data forecast](docs/forecast_real.png)

> AI-powered sales forecasting for small businesses. ASP.NET Core + FastAPI + LLM.

*Lumen-X: the future, in plain sight.*

**Lumen-X** is a sales forecasting system with an AI assistant that explains the numbers in plain language. Built for small businesses: shops, restaurants and small e-commerce stores.

Upload your sales data, get reliable forecasts, and ask questions like:

- *"How much should I reorder next week?"*
- *"Why are March sales below forecast?"*
- *"Which products are at risk of stocking out?"*

## Why I built this

I'm a .NET developer with about two years of professional experience, and I got hooked on AI. I wanted to learn by building something real: a project that combines classical forecasting with LLMs, written with the stack I know and the one I want to learn.

Small businesses have the data but not a data team. Lumen-X aims to close that gap: solid models under the hood, clear answers on the surface.

## How it works

```
CSV / API  →  .NET Backend  →  Forecasting service (Python)
                  │                        │
                  ▼                        ▼
              PostgreSQL            Statistical / ML models
                  │
                  ▼
           LLM layer (explanations and data Q&A)
                  │
                  ▼
              Dashboard
```

| Component | Technology |
|---|---|
| Backend and API | C# / ASP.NET Core |
| Forecasting | Python, FastAPI, statsmodels, LightGBM |
| AI layer | LLM via API |
| Database | PostgreSQL |
| Frontend | Blazor |
| Deployment | Docker Compose |

## Features

- [ ] Sales data import from CSV
- [x] Baseline models and time-aware backtesting
- [ ] Forecasts by product and time period
- [ ] Natural-language explanations of forecasts
- [ ] Chat-based questions over your data
- [ ] Reorder suggestions (safety stock)
- [ ] Interactive dashboard

## Model evaluation

Models are compared against a seasonal naive baseline using expanding-window backtesting with a 28-day horizon, with no data leakage (lags and rolling features only use data at least 28 days old).

![Global model forecast](docs/forecast_global.png)

**Global LightGBM** (Kaggle Store Sales, all 54 stores x 33 product families, 3 backtest windows):

| model | WAPE | RMSLE |
|:--|--:|--:|
| seasonal naive | 17.1 | 0.550 |
| LightGBM (global) | 13.5 | 0.413 |

The global model beats the baseline in every window, cutting WAPE by about 21% and RMSLE by about 25%.

**Single series** (store 1, GROCERY I): LightGBM (MAPE 19.3) and ETS (20.4) are close, both ahead of the naive baseline (21.9). Learning across series is what makes the difference.

**Limitations:** only 3 recent backtest windows, no hyperparameter tuning, no external features (oil, transactions, local holidays).

Notebooks: [`01`](./notebooks/01_eda_baseline.ipynb) synthetic data baseline, [`02`](./notebooks/02_real_data_lightgbm.ipynb) real single series, [`03`](./notebooks/03_global_lightgbm.ipynb) global model.

## API

![Forecasting service API](docs/api-docs.png)

## Quick start

> 🚧 Coming soon: the `docker-compose.yml` will be available with the first version of the backend.

```bash
git clone https://github.com/asciosh/lumen-x.git
cd lumen-x
docker compose up
```

## Roadmap

- [x] **Notebooks**: EDA, baselines, single-series and global LightGBM models with backtesting
- [ ] **Forecasting service** exposing a `/forecast` endpoint (FastAPI)
- [ ] **.NET backend** and persistence
- [ ] **LLM layer** for explanations and data Q&A
- [ ] **Dashboard**, deployment and a trial with real data

## Project status

🚧 Work in progress. A side project built to learn and experiment with forecasting and applied AI, with the goal of making it production-ready.

## License

[MIT](./LICENSE)
