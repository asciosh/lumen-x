import { isoFromDayNumber } from "./dates";
import { METHODS } from "./models";
import { prepareSeries } from "./series";
import {
  SeriesError,
  type BacktestMetrics,
  type ForecastResult,
  type MethodName,
  type MethodRequest,
  type SalePoint,
} from "./types";

/** z for an 80% two-sided interval. */
export const Z80 = 1.2816;

/** Consecutive backtest windows, starting from the most recent. */
export const BACKTEST_FOLDS = 3;
/** Minimum training days for any window. */
export const MIN_FOLD_TRAIN = 28;
export const MIN_DAYS = 42;
export const MAX_HORIZON = 90;
/** A longer history is not needed (and would cost CPU): the models only look at the last year. */
export const MAX_DAYS = 3650;

export function holdoutSize(n: number, h: number): number {
  return Math.min(h, Math.floor(n / 4));
}

/** Cut points of the backtest windows, most recent first. Windows do not overlap. */
export function foldCuts(n: number, k: number): number[] {
  const cuts: number[] = [];
  for (let i = 0; i < BACKTEST_FOLDS; i++) {
    const cut = n - k * (i + 1);
    if (cut < MIN_FOLD_TRAIN) {
      break;
    }
    cuts.push(cut);
  }
  return cuts;
}

function scores(errors: number[]): BacktestMetrics {
  let abs = 0;
  let sq = 0;
  for (const e of errors) {
    abs += Math.abs(e);
    sq += e * e;
  }
  return { mae: abs / errors.length, rmse: Math.sqrt(sq / errors.length) };
}

/** Scores every method on all the windows together: one window alone can be lucky or unlucky. */
export function backtest(
  y: readonly number[],
  h: number,
  methods: readonly MethodName[],
): { holdout: number; metrics: Record<string, BacktestMetrics> } {
  const k = holdoutSize(y.length, h);
  let cuts = foldCuts(y.length, k);
  if (cuts.length === 0) {
    cuts = [y.length - k];
  }

  const errors: Record<string, number[]> = {};
  const failed = new Set<string>();
  for (const m of methods) {
    errors[m] = [];
  }

  for (const cut of cuts) {
    const train = y.slice(0, cut);
    const test = y.slice(cut, cut + k);
    for (const m of methods) {
      if (failed.has(m)) {
        continue;
      }
      try {
        const pred = METHODS[m](train, k);
        test.forEach((actual, i) => errors[m]!.push(actual - pred[i]!));
      } catch (error) {
        if (methods.length === 1) {
          throw new SeriesError(`Method '${m}' failed: ${(error as Error).message}`);
        }
        failed.add(m); // a failing method must not break "auto"
      }
    }
  }

  const metrics: Record<string, BacktestMetrics> = {};
  for (const m of methods) {
    if (!failed.has(m) && errors[m]!.length > 0) {
      metrics[m] = scores(errors[m]!);
    }
  }
  if (Object.keys(metrics).length === 0) {
    throw new SeriesError("No method could be fitted on this series.");
  }
  return { holdout: k, metrics };
}

/**
 * Forecast with backtest. "auto" tries the weekly naive and ETS and keeps the one with the lowest backtest RMSE.
 * (The full Lumen-X stack also has LightGBM and the average of ETS and LightGBM; they do not run in a Worker.)
 */
export function runForecast(points: readonly SalePoint[], horizon: number, method: MethodRequest = "auto"): ForecastResult {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON) {
    throw new SeriesError(`The horizon must be between 1 and ${MAX_HORIZON} days.`);
  }
  if (points.length < MIN_DAYS) {
    throw new SeriesError(`At least ${MIN_DAYS} days of sales are required: found ${points.length}.`);
  }
  if (points.length > MAX_DAYS) {
    throw new SeriesError(`At most ${MAX_DAYS} days of sales are accepted: found ${points.length}.`);
  }

  const prepared = prepareSeries(points);
  const y = prepared.values;
  const candidates: MethodName[] = method === "auto" ? ["naive", "ets"] : [method];

  const { holdout, metrics } = backtest(y, horizon, candidates);

  let chosen = Object.keys(metrics)[0] as MethodName;
  for (const m of Object.keys(metrics) as MethodName[]) {
    if (metrics[m]!.rmse < metrics[chosen]!.rmse) {
      chosen = m;
    }
  }

  let pred: number[];
  try {
    pred = METHODS[chosen](y, horizon);
  } catch (error) {
    throw new SeriesError(`Method '${chosen}' failed: ${(error as Error).message}`);
  }

  const band = Z80 * metrics[chosen]!.rmse;
  const nonNegative = y.every((v) => v >= 0); // sales cannot be negative
  const clip = (v: number) => (nonNegative ? Math.max(0, v) : v);
  const lastDay = prepared.startDay + y.length - 1;

  return {
    methodRequested: method,
    methodUsed: chosen,
    horizon,
    holdoutDays: holdout,
    filledMissingDays: prepared.filled,
    intervalLevel: 0.8,
    backtest: metrics,
    forecast: pred.map((p, i) => ({
      date: isoFromDayNumber(lastDay + 1 + i),
      yhat: clip(p),
      lower: clip(p - band),
      upper: clip(p + band),
    })),
  };
}
