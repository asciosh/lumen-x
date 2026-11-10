// Output of the Python service (statsmodels ETS) on the Bread series of docs/data/sales.json, horizon 28.
// Used to check that the TypeScript engine stays close to the reference implementation.
export const PYTHON_ETS_YHAT: number[] = [1430.87, 1134.51, 1516.68, 2035.99, 2222.55, 1425.03, 1263.82, 1430.87, 1134.51, 1516.68, 2035.99, 2222.55, 1425.03, 1263.82, 1430.87, 1134.51, 1516.68, 2035.99, 2222.55, 1425.03, 1263.82, 1430.87, 1134.51, 1516.68, 2035.99, 2222.55, 1425.03, 1263.82];
export const PYTHON_BACKTEST = {"naive": {"mae": 160.386, "rmse": 226.7341804461675}, "ets": {"mae": 137.57987346251866, "rmse": 183.16257675074928}};
