import { describe, expect, it } from "vitest";
import type { ExplanationFacts } from "../src/engine/explain";
import { calculateReorder } from "../src/engine/reorder";
import { buildSummary, trustVerdict } from "../src/engine/summary";

const BASE: ExplanationFacts = {
  productName: "Pane", historyDays: 90, historyEnd: "2025-03-31", methodUsed: "ets", horizon: 28, forecastStart: "2025-04-01", forecastEnd: "2025-04-28",
  forecastTotal: 2800, forecastAvgPerDay: 100, referenceDays: 28, referenceAvgPerDay: 95, changePercent: 5.3, strongestWeekday: "Saturday", strongestWeekdayAvg: 150,
  weakestWeekday: "Monday", weakestWeekdayAvg: 70, intervalHalfWidthPercent: 12, holdoutDays: 14, maeUsed: 5, maeNaive: 8, improvementVsNaivePercent: 37.5,
  filledMissingDays: 0, zeroDaysPercent: 0,
};
const withError = (mae: number | null, extra: Partial<ExplanationFacts> = {}) => ({ ...BASE, maeUsed: mae, ...extra });

describe("trust verdict: the error against the size of the forecast", () => {
  it.each([
    [0, "high"], [5, "high"], [9.99, "high"],
    [10, "medium"], [19.99, "medium"],
    [20, "low"], [34.99, "low"],
    [35, "very_low"], [80, "very_low"],
  ] as const)("error of %s%% of the forecast is %s", (mae, level) => {
    const trust = trustVerdict(withError(mae)); // the forecast average is 100: the error in units is the percentage
    expect(trust.level).toBe(level);
    expect(trust.errorPercent).toBeCloseTo(mae, 9);
    expect(trust.errorUnits).toBe(mae);
  });

  it("nothing to check it against means no promises, and an empty forecast has no percentage", () => {
    expect(trustVerdict(withError(null))).toMatchObject({ level: "low", errorPercent: null, errorUnits: null });
    expect(trustVerdict(withError(5, { forecastAvgPerDay: 0 }))).toMatchObject({ level: "low", errorPercent: null });
  });

  it("a forecast that does no better than repeating last week is never better than low", () => {
    expect(trustVerdict(withError(5, { improvementVsNaivePercent: -3 }))).toMatchObject({ level: "low", beatsNaive: false });
    expect(trustVerdict(withError(5, { improvementVsNaivePercent: 0 }))).toMatchObject({ level: "low", beatsNaive: false });
    expect(trustVerdict(withError(5, { improvementVsNaivePercent: 12 }))).toMatchObject({ level: "high", beatsNaive: true });
    expect(trustVerdict(withError(50, { improvementVsNaivePercent: -3 })).level).toBe("very_low"); // it only makes things worse, never better
  });

  it("the comparison is unknown when last week's repetition was the method used, or when there was nothing to compare with", () => {
    expect(trustVerdict(withError(5, { methodUsed: "naive", improvementVsNaivePercent: 20 })).beatsNaive).toBeNull();
    expect(trustVerdict(withError(5, { methodUsed: "NAIVE", improvementVsNaivePercent: null })).beatsNaive).toBeNull();
    expect(trustVerdict(withError(5, { improvementVsNaivePercent: null })).beatsNaive).toBeNull();
    expect(trustVerdict(withError(5, { improvementVsNaivePercent: null })).level).toBe("high");
  });

  it("many days with zero sales: low from 20%, very low from 50%", () => {
    expect(trustVerdict(withError(5, { zeroDaysPercent: 19.9 }))).toMatchObject({ level: "high", intermittent: false });
    expect(trustVerdict(withError(5, { zeroDaysPercent: 20 }))).toMatchObject({ level: "low", intermittent: true, zeroDaysPercent: 20 });
    expect(trustVerdict(withError(5, { zeroDaysPercent: 49.9 })).level).toBe("low");
    expect(trustVerdict(withError(5, { zeroDaysPercent: 50 })).level).toBe("very_low");
    expect(trustVerdict(withError(50, { zeroDaysPercent: 20 })).level).toBe("very_low"); // already worse: it stays
  });
});

describe("summary: the three answers", () => {
  const points = Array.from({ length: 28 }, (_, i) => ({ date: `2025-04-${String(i + 1).padStart(2, "0")}`, yhat: 100, lower: 90, upper: 110 }));
  const run = { methodUsed: "ets", backtest: { ets: { mae: 5, rmse: 6 } }, forecast: points };

  it("puts the forecast, the order and the trust together", () => {
    const outcome = calculateReorder(run, 7, 7, 95, 300, 0);
    const s = buildSummary(BASE, outcome);
    expect(s.sales).toEqual({ days: 28, start: "2025-04-01", end: "2025-04-28", total: 2800, avgPerDay: 100, referenceDays: 28, changePercent: 5.3, strongestWeekday: "Saturday", weakestWeekday: "Monday" });
    expect(s.orderError).toBeNull();
    expect(s.order).toMatchObject({ periodDays: 14, leadTimeDays: 7, reviewDays: 7, serviceLevelPercent: 95, demandInPeriod: 1400, onHand: 300 });
    expect(s.order!.orderUpToLevel).toBeCloseTo(1400 + 1.6449 * 6 * Math.sqrt(14), 6);
    expect(s.order!.suggestedOrder).toBe(Math.ceil(s.order!.orderUpToLevel - 300));
    expect(s.trust.level).toBe("high");
  });

  it("without the stock there is no suggested order, only the level to reach", () => {
    const s = buildSummary(BASE, calculateReorder(run, 7, 7, 95, null, 0));
    expect(s.order).toMatchObject({ onHand: null, suggestedOrder: null });
    expect(s.order!.orderUpToLevel).toBeGreaterThan(1400);
  });

  it("an order that cannot be worked out says why, and the rest is still there", () => {
    const s = buildSummary(BASE, calculateReorder({ ...run, forecast: points.slice(0, 10) }, 7, 7, 95, null, 0));
    expect(s.order).toBeNull();
    expect(s.orderError).toContain("exceeds the forecast horizon (10 days)");
    expect(s.sales.total).toBe(2800);
    expect(s.trust.level).toBe("high");
  });
});
