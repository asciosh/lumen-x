from fastapi import FastAPI, HTTPException

from .schemas import ForecastRequest, ForecastResponse
from .service import SeriesError, run_forecast

app = FastAPI(
    title="Lumen-X Forecasting Service",
    version="0.1.0",
    description="Daily sales forecasting: seasonal naive, ETS and LightGBM, "
                "with automatic model selection by holdout backtest.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest) -> dict:
    try:
        return run_forecast(
            dates=[p.date for p in req.series],
            values=[p.value for p in req.series],
            h=req.horizon,
            method=req.method,
        )
    except SeriesError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
