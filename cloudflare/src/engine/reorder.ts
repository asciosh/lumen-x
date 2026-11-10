import type { BacktestMetrics, ForecastPoint, ForecastResult } from "./types";

export const MAX_DAYS = 60;

/** Above this percentage of zero-sales days the series is intermittent and the calculation is not reliable. */
export const INTERMITTENT_THRESHOLD_PERCENT = 20;

/** Standard normal values (one-sided quantile) for the allowed service levels. */
const Z_BY_SERVICE_LEVEL: Record<number, number> = { 90: 1.2816, 95: 1.6449, 98: 2.0537, 99: 2.3263 };

/** The forecast computes the 80% band as yhat +- 1.2816 x RMSE. */
const INTERVAL_Z = 1.2816;

export const SERVICE_LEVELS = Object.keys(Z_BY_SERVICE_LEVEL).map(Number);

export interface ReorderSuggestion {
  methodUsed: string;
  leadTimeDays: number;
  reviewDays: number;
  periodDays: number;
  serviceLevelPercent: number;
  zValue: number;
  demandInPeriod: number;
  dailyErrorStdDev: number;
  safetyStock: number;
  orderUpToLevel: number;
  onHand: number | null;
  suggestedOrder: number | null;
  warnings: string[];
}

/** What the reorder calculation needs from a forecast run. */
export interface ReorderRun {
  methodUsed: string;
  backtest: Record<string, BacktestMetrics>;
  forecast: readonly ForecastPoint[];
}

export type ReorderOutcome = { ok: true; suggestion: ReorderSuggestion } | { ok: false; error: string };

/**
 * Periodic-review reorder level ("order-up-to"):
 *
 *   period P            = lead time days + days between orders
 *   demand in period    = sum of the forecasts of the first P days
 *   safety stock        = z * daily error (backtest RMSE) * square root of P
 *   maximum level       = demand in period + safety stock
 *   suggested order     = maximum level - current stock (never negative, rounded up)
 *
 * Declared limit: the square root of P assumes errors are independent from one day to the next. If the level
 * of sales changes suddenly, the error weighs on all days together and the safety stock turns out a bit low.
 */
export function calculateReorder(
  run: ReorderRun,
  leadTimeDays: number,
  reviewDays: number,
  serviceLevelPercent: number,
  onHand: number | null,
  zeroDaysPercent: number,
): ReorderOutcome {
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 1 || leadTimeDays > MAX_DAYS) {
    return { ok: false, error: `Lead time must be between 1 and ${MAX_DAYS} days.` };
  }
  if (!Number.isInteger(reviewDays) || reviewDays < 0 || reviewDays > MAX_DAYS) {
    return { ok: false, error: `Review days must be between 0 and ${MAX_DAYS}.` };
  }
  const z = Z_BY_SERVICE_LEVEL[serviceLevelPercent];
  if (z === undefined) {
    return { ok: false, error: "The service level must be 90, 95, 98 or 99." };
  }
  if (onHand !== null && (!Number.isFinite(onHand) || onHand < 0)) {
    return { ok: false, error: "Current stock must be a number greater than or equal to zero." };
  }

  const points = [...run.forecast].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const period = leadTimeDays + reviewDays;
  if (period > points.length) {
    return {
      ok: false,
      error:
        `The period to cover (${period} days) exceeds the forecast horizon (${points.length} days): ` +
        `recompute the forecast with a horizon of at least ${period} days.`,
    };
  }

  const demand = points.slice(0, period).reduce((total, p) => total + p.yhat, 0);
  const sigma = dailyErrorStdDev(run, points);
  const safetyStock = z * sigma * Math.sqrt(period);
  const orderUpToLevel = demand + safetyStock;
  const suggestedOrder = onHand === null ? null : Math.ceil(Math.max(0, orderUpToLevel - onHand));

  const warnings: string[] = [];
  if (zeroDaysPercent >= INTERMITTENT_THRESHOLD_PERCENT) {
    warnings.push("intermittent");
  }

  return {
    ok: true,
    suggestion: {
      methodUsed: run.methodUsed,
      leadTimeDays,
      reviewDays,
      periodDays: period,
      serviceLevelPercent,
      zValue: z,
      demandInPeriod: demand,
      dailyErrorStdDev: sigma,
      safetyStock,
      orderUpToLevel,
      onHand,
      suggestedOrder,
      warnings,
    },
  };
}

/** Percentage of days with zero sales in the history. */
export function zeroDaysPercent(quantities: readonly number[]): number {
  if (quantities.length === 0) {
    return 0;
  }
  return (quantities.filter((q) => q === 0).length * 100) / quantities.length;
}

/** Backtest RMSE of the method used; if missing, derived from the forecast's 80% band. */
function dailyErrorStdDev(
  run: Pick<ReorderRun, "methodUsed" | "backtest">,
  points: ForecastResult["forecast"],
): number {
  const metrics = run.backtest[run.methodUsed];
  if (metrics !== undefined && Number.isFinite(metrics.rmse)) {
    return metrics.rmse;
  }
  const halfWidth = points.reduce((total, p) => total + (p.upper - p.lower) / 2, 0) / points.length;
  return halfWidth / INTERVAL_Z;
}
