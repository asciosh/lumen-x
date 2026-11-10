import { describe, expect, it } from "vitest";
import { calculateReorder, zeroDaysPercent } from "../src/engine/reorder";
import type { BacktestMetrics, ForecastPoint } from "../src/engine/types";

/** 14 or more days at a constant forecast, with a backtest RMSE for the method used. */
function run(days: number, yhat: number, rmse: number | null) {
  const forecast: ForecastPoint[] = Array.from({ length: days }, (_, i) => ({
    date: `2025-03-${String(i + 1).padStart(2, "0")}`,
    yhat,
    lower: yhat - 10,
    upper: yhat + 10,
  }));
  const backtest: Record<string, BacktestMetrics> = rmse === null ? {} : { ets: { mae: rmse * 0.8, rmse } };
  return { methodUsed: "ets" as const, backtest, forecast };
}

describe("calculateReorder", () => {
  it("matches the worked example: 14 days at 100, RMSE 20, 95%", () => {
    const r = calculateReorder(run(28, 100, 20), 7, 7, 95, null, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.suggestion.periodDays).toBe(14);
    expect(r.suggestion.demandInPeriod).toBe(1400);
    expect(r.suggestion.safetyStock).toBeCloseTo(1.6449 * 20 * Math.sqrt(14), 6); // 123.09
    expect(r.suggestion.orderUpToLevel).toBeCloseTo(1523.09, 2);
    expect(r.suggestion.suggestedOrder).toBeNull();
  });

  it("suggests the order from the current stock, rounded up", () => {
    const r = calculateReorder(run(28, 100, 20), 7, 7, 95, 300, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.suggestion.suggestedOrder).toBe(1224); // 1523.09 - 300 = 1223.09 -> 1224
  });

  it("never suggests a negative order", () => {
    const r = calculateReorder(run(28, 100, 20), 7, 7, 95, 99999, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.suggestion.suggestedOrder).toBe(0);
  });

  it("a higher service level means more safety stock", () => {
    const stock = (level: number) => {
      const r = calculateReorder(run(28, 100, 20), 7, 7, level, null, 0);
      if (!r.ok) throw new Error(r.error);
      return r.suggestion.safetyStock;
    };
    expect(stock(90)).toBeLessThan(stock(95));
    expect(stock(95)).toBeLessThan(stock(98));
    expect(stock(98)).toBeLessThan(stock(99));
  });

  it("uses the first P days only", () => {
    const base = run(28, 100, 20);
    base.forecast[14] = { ...base.forecast[14]!, yhat: 999999 }; // day 15 must not count
    const r = calculateReorder(base, 7, 7, 95, null, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.suggestion.demandInPeriod).toBe(1400);
  });

  it("derives the error from the band when the backtest is missing", () => {
    const r = calculateReorder(run(28, 100, null), 7, 7, 95, null, 0);
    if (!r.ok) throw new Error(r.error);
    expect(r.suggestion.dailyErrorStdDev).toBeCloseTo(10 / 1.2816, 9);
  });

  it("warns about intermittent series from 20% of zero days", () => {
    const at = (pct: number) => {
      const r = calculateReorder(run(28, 100, 20), 7, 7, 95, null, pct);
      if (!r.ok) throw new Error(r.error);
      return r.suggestion.warnings;
    };
    expect(at(19.9)).toEqual([]);
    expect(at(20)).toEqual(["intermittent"]);
  });

  it("explains a period longer than the forecast", () => {
    const r = calculateReorder(run(10, 100, 20), 7, 7, 95, null, 0);
    expect(r).toEqual({
      ok: false,
      error:
        "The period to cover (14 days) exceeds the forecast horizon (10 days): " +
        "recompute the forecast with a horizon of at least 14 days.",
    });
  });

  it.each([
    [0, 7, 95, null, "Lead time must be between 1 and 60 days."],
    [61, 7, 95, null, "Lead time must be between 1 and 60 days."],
    [7, -1, 95, null, "Review days must be between 0 and 60."],
    [7, 7, 97, null, "The service level must be 90, 95, 98 or 99."],
    [7, 7, 95, -1, "Current stock must be a number greater than or equal to zero."],
    [7, 7, 95, Number.NaN, "Current stock must be a number greater than or equal to zero."],
  ])("rejects lead=%s review=%s level=%s stock=%s", (lead, review, level, stock, message) => {
    const r = calculateReorder(run(28, 100, 20), lead, review, level, stock, 0);
    expect(r).toEqual({ ok: false, error: message });
  });
});

describe("zeroDaysPercent", () => {
  it("counts the days at zero", () => {
    expect(zeroDaysPercent([0, 0, 5, 5])).toBe(50);
    expect(zeroDaysPercent([1, 2, 3])).toBe(0);
    expect(zeroDaysPercent([])).toBe(0);
  });
});
