import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field


class Observation(BaseModel):
    date: dt.date
    value: float


class ForecastRequest(BaseModel):
    series: list[Observation] = Field(
        min_length=42,
        description="Daily history (at least 42 days). Missing days are interpolated.",
    )
    horizon: int = Field(28, ge=1, le=90, description="Days to forecast.")
    method: Literal["auto", "naive", "ets", "lightgbm"] = Field(
        "auto",
        description="'auto' backtests the available methods on a holdout and picks the best.",
    )


class ForecastPoint(BaseModel):
    date: dt.date
    yhat: float
    lower: float
    upper: float


class BacktestMetrics(BaseModel):
    mae: float
    rmse: float


class ForecastResponse(BaseModel):
    method_used: str
    horizon: int
    holdout_days: int
    filled_missing_days: int
    interval: str = "approx. 80% (holdout RMSE)"
    backtest: dict[str, BacktestMetrics]
    forecast: list[ForecastPoint]
