"""Forecasting methods. Each takes a daily pd.Series and a horizon, returns a numpy array."""
import numpy as np
import pandas as pd
import lightgbm as lgb
from statsmodels.tsa.holtwinters import ExponentialSmoothing

SEASON = 7
MIN_LIGHTGBM_TRAIN = 90   # rows left for training after reserving the horizon


def naive_seasonal(y: pd.Series, h: int) -> np.ndarray:
    """Repeat the last observed week."""
    last = y.to_numpy(dtype=float)[-SEASON:]
    return np.tile(last, h // SEASON + 1)[:h]


def ets(y: pd.Series, h: int) -> np.ndarray:
    """Additive Holt-Winters with damped trend and weekly seasonality."""
    model = ExponentialSmoothing(
        y.to_numpy(dtype=float),
        trend="add",
        damped_trend=True,
        seasonal="add",
        seasonal_periods=SEASON,
        initialization_method="estimated",
    ).fit()
    return np.asarray(model.forecast(h))


def lightgbm_ok(n: int, h: int) -> bool:
    return n - h >= MIN_LIGHTGBM_TRAIN


def _features(y_ext: pd.Series, h: int) -> pd.DataFrame:
    """Calendar + lag features. Every lag is >= h, so the whole horizon is
    predicted in one shot without leakage (same idea as notebooks 02 and 03)."""
    idx = y_ext.index
    X = pd.DataFrame(index=idx)
    X["dow"] = idx.dayofweek
    X["dom"] = idx.day
    X["month"] = idx.month
    X["doy"] = idx.dayofyear
    for lag in (h, h + 7, h + 14, h + 28):
        X[f"lag_{lag}"] = y_ext.shift(lag)
    if len(y_ext) - h >= 400:
        X["lag_364"] = y_ext.shift(364)
    for w in (7, 28):
        X[f"roll_mean_{w}"] = y_ext.shift(h).rolling(w, min_periods=1).mean()
    return X


def lightgbm_forecast(y: pd.Series, h: int) -> np.ndarray:
    n = len(y)
    if not lightgbm_ok(n, h):
        raise ValueError("not enough history for lightgbm")
    future = pd.date_range(y.index[-1] + pd.Timedelta(days=1), periods=h, freq="D")
    y_ext = pd.concat([y.astype(float), pd.Series(np.nan, index=future)])
    X = _features(y_ext, h)
    mask = y_ext.notna().to_numpy() & X[f"lag_{h}"].notna().to_numpy()
    model = lgb.LGBMRegressor(
        n_estimators=300, learning_rate=0.03, num_leaves=31,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
        random_state=42, verbose=-1,
    )
    model.fit(X[mask], y_ext[mask])
    return model.predict(X.iloc[n:])


METHODS = {"naive": naive_seasonal, "ets": ets, "lightgbm": lightgbm_forecast}
