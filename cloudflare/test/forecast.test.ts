import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { backtest, foldCuts, holdoutSize, runForecast, Z80 } from "../src/engine/forecast";
import { ets, naiveSeasonal } from "../src/engine/models";
import { prepareSeries } from "../src/engine/series";
import { dayNumber, isoFromDayNumber } from "../src/engine/dates";
import { SeriesError, type SalePoint } from "../src/engine/types";
import { PYTHON_BACKTEST, PYTHON_ETS_YHAT } from "./fixtures_python";

// Real data: a bakery product of the Kaggle Store Sales dataset (1684 days), the same series the demo shows.
const BREAD: SalePoint[] = JSON.parse(readFileSync(new URL("../../docs/data/sales.json", import.meta.url), "utf8"));

const days = (n: number, f: (i: number) => number, start = "2025-01-01"): SalePoint[] =>
  Array.from({ length: n }, (_, i) => ({ date: isoFromDayNumber(dayNumber(start) + i), quantity: f(i) }));

describe("windows", () => {
  it("holdout is the horizon, but at most a quarter of the series", () => {
    expect(holdoutSize(500, 28)).toBe(28);
    expect(holdoutSize(60, 28)).toBe(15);
    expect(holdoutSize(42, 28)).toBe(10);
  });

  it("uses up to three consecutive windows, most recent first", () => {
    expect(foldCuts(500, 28)).toEqual([472, 444, 416]);
  });

  it("drops a window that would leave too little training", () => {
    expect(foldCuts(60, 15)).toEqual([45, 30]); // the third would train on 15 days (< 28)
    expect(foldCuts(42, 10)).toEqual([32]);
  });
});

describe("models", () => {
  it("naive repeats the last week", () => {
    const y = [1, 2, 3, 4, 5, 6, 7, 10, 20, 30, 40, 50, 60, 70];
    expect(naiveSeasonal(y, 10)).toEqual([10, 20, 30, 40, 50, 60, 70, 10, 20, 30]);
  });

  it("ets reproduces a pure weekly pattern", () => {
    const y = days(120, (i) => 100 + 10 * (i % 7)).map((p) => p.quantity);
    const f = ets(y, 14);
    f.forEach((v, i) => expect(v).toBeCloseTo(100 + 10 * ((120 + i) % 7), 0));
  });

  it("ets follows a trend that naive cannot", () => {
    const y = days(120, (i) => 50 + 2 * i + 10 * (i % 7)).map((p) => p.quantity);
    const e = ets(y, 14).reduce((s, v, i) => s + Math.abs(v - (50 + 2 * (120 + i) + 10 * ((120 + i) % 7))), 0);
    const n = naiveSeasonal(y, 14).reduce((s, v, i) => s + Math.abs(v - (50 + 2 * (120 + i) + 10 * ((120 + i) % 7))), 0);
    expect(e).toBeLessThan(n / 3);
  });

  it("ets needs two weeks of data", () => {
    expect(() => ets([1, 2, 3], 7)).toThrow("two weeks");
  });
});

describe("on the real Bread series", () => {
  // The series as the engine really sees it: with the 4 missing days (25 December) filled in.
  const y = prepareSeries(BREAD).values;

  it("naive gets exactly the error of the Python service", () => {
    const { metrics } = backtest(y, 28, ["naive"]);
    expect(metrics.naive!.rmse).toBeCloseTo(PYTHON_BACKTEST.naive.rmse, 6);
    expect(metrics.naive!.mae).toBeCloseTo(PYTHON_BACKTEST.naive.mae, 6);
  });

  it("ets is within 4% of the statsmodels error (it is about 2.6% worse: a small grid instead of an optimizer)", () => {
    const { metrics } = backtest(y, 28, ["ets"]);
    expect(metrics.ets!.rmse).toBeGreaterThan(PYTHON_BACKTEST.ets.rmse * 0.97);
    expect(metrics.ets!.rmse).toBeLessThan(PYTHON_BACKTEST.ets.rmse * 1.04);
    expect(Math.abs(metrics.ets!.mae / PYTHON_BACKTEST.ets.mae - 1)).toBeLessThan(0.05);
  });

  it("the ets forecast stays close to the Python one", () => {
    const mine = ets(y, 28);
    const relativeGap =
      mine.reduce((s, v, i) => s + Math.abs(v - PYTHON_ETS_YHAT[i]!), 0) / PYTHON_ETS_YHAT.reduce((s, v) => s + v, 0);
    // Each forecast is off by about 13% of the sales (RMSE 183 on a mean of 1385), so two good forecasts
    // may differ by a few percent day by day (today: about 3%).
    expect(relativeGap).toBeLessThan(0.05);
  });

  it("auto keeps ets and reports both methods", () => {
    const r = runForecast(BREAD, 28, "auto");
    expect(r.methodRequested).toBe("auto");
    expect(r.methodUsed).toBe("ets");
    expect(Object.keys(r.backtest).sort()).toEqual(["ets", "naive"]);
    expect(r.holdoutDays).toBe(28);
    expect(r.filledMissingDays).toBe(4); // 25 December is missing every year: the stores are closed
    expect(r.backtest.ets!.rmse).toBeLessThan(r.backtest.naive!.rmse);
  });

  it("the forecast starts the day after the last day and has the interval of the Python service", () => {
    const r = runForecast(BREAD, 28);
    expect(r.forecast).toHaveLength(28);
    expect(r.forecast[0]!.date).toBe("2017-08-16");
    expect(r.forecast[27]!.date).toBe("2017-09-12");
    const band = Z80 * r.backtest[r.methodUsed]!.rmse;
    r.forecast.forEach((p) => {
      expect(p.upper - p.yhat).toBeCloseTo(band, 6);
      expect(p.yhat - p.lower).toBeCloseTo(band, 6);
      expect(p.lower).toBeGreaterThanOrEqual(0);
    });
  });

  it("a full request is cheap enough for the free Workers plan (about 10 ms of CPU)", () => {
    runForecast(BREAD, 28); // warm-up
    const start = performance.now();
    for (let i = 0; i < 10; i++) runForecast(BREAD, 28);
    const perRequest = (performance.now() - start) / 10;
    expect(perRequest).toBeLessThan(8);
  });
});

describe("runForecast", () => {
  it("fills gaps and reports how many", () => {
    const pts = days(100, (i) => 100 + 10 * (i % 7)).filter((_, i) => i % 10 !== 5);
    const r = runForecast(pts, 14);
    expect(r.filledMissingDays).toBe(10);
    expect(r.forecast).toHaveLength(14);
  });

  it("never forecasts negative sales", () => {
    const pts = days(100, (i) => (i % 7 === 0 ? 0 : 3));
    const r = runForecast(pts, 28, "ets");
    expect(r.forecast.every((p) => p.yhat >= 0 && p.lower >= 0 && p.upper >= 0)).toBe(true);
  });

  it("a series of zeros gives zeros and no NaN", () => {
    const r = runForecast(days(80, () => 0), 14);
    expect(r.forecast.every((p) => p.yhat === 0 && p.lower === 0 && p.upper === 0)).toBe(true);
  });

  it("a method can be requested", () => {
    const pts = days(100, (i) => 100 + 10 * (i % 7));
    expect(runForecast(pts, 14, "naive").methodUsed).toBe("naive");
    expect(Object.keys(runForecast(pts, 14, "ets").backtest)).toEqual(["ets"]);
  });

  it("a weekly pattern is forecast with almost no error", () => {
    const r = runForecast(days(200, (i) => 100 + 10 * (i % 7)), 28);
    expect(r.backtest[r.methodUsed]!.rmse).toBeLessThan(1);
  });

  it("works with the minimum of 42 days", () => {
    const r = runForecast(days(42, (i) => 100 + 10 * (i % 7)), 28);
    expect(r.holdoutDays).toBe(10);
    expect(r.forecast).toHaveLength(28);
  });

  it("rejects too little data, a bad horizon and too much data", () => {
    expect(() => runForecast(days(41, () => 1), 7)).toThrow("At least 42 days of sales are required: found 41.");
    expect(() => runForecast(days(60, () => 1), 0)).toThrow("The horizon must be between 1 and 90 days.");
    expect(() => runForecast(days(60, () => 1), 91)).toThrow(SeriesError);
    expect(() => runForecast(days(60, () => 1), 2.5)).toThrow(SeriesError);
    expect(() => runForecast(days(3651, () => 1), 7)).toThrow("At most 3650 days");
  });

  it("is deterministic", () => {
    const a = runForecast(BREAD, 28);
    const b = runForecast(BREAD, 28);
    expect(a).toEqual(b);
  });
});
