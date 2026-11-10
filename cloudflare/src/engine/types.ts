/** One day of sales. `date` is an ISO date (YYYY-MM-DD). */
export interface SalePoint {
  date: string;
  quantity: number;
}

export interface BacktestMetrics {
  mae: number;
  rmse: number;
}

export interface ForecastPoint {
  date: string;
  yhat: number;
  lower: number;
  upper: number;
}

export type MethodName = "naive" | "ets";
export type MethodRequest = "auto" | MethodName;

/** Same shape as the response of the full Lumen-X stack, so the same dashboard can show both. */
export interface ForecastResult {
  methodRequested: MethodRequest;
  methodUsed: MethodName;
  horizon: number;
  holdoutDays: number;
  filledMissingDays: number;
  /** Width of the band: yhat +- z x RMSE of the method used, with z = 1.2816 (80%). */
  intervalLevel: number;
  backtest: Record<string, BacktestMetrics>;
  forecast: ForecastPoint[];
}

/** The input series or the requested method cannot be used. The message is meant for the user (in English). */
export class SeriesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeriesError";
  }
}
