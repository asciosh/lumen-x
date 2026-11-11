import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExplanationFacts } from "../src/engine/explain";
import { calculateReorder } from "../src/engine/reorder";
import { trustVerdict } from "../src/engine/summary";

/** The files of the public demo (GitHub Pages) live in docs/ at the root of the repository. */
const docs = (file: string) => new URL(`../../docs/${file}`, import.meta.url);
const read = (file: string) => readFileSync(docs(file), "utf8");
const json = (file: string) => JSON.parse(read(file));

const module = { exports: {} as { trustVerdict: (f: unknown) => unknown; suggestedOrder: (level: number, onHand: number) => number } };
new Function("module", "window", read("summary.js"))(module, undefined);
const page = module.exports;

describe("the demo's summary.js gives the same answers as the code of the app", () => {
  const base: ExplanationFacts = {
    productName: "Pane", historyDays: 90, historyEnd: "2025-03-31", methodUsed: "ets", horizon: 28, forecastStart: "2025-04-01", forecastEnd: "2025-04-28",
    forecastTotal: 2800, forecastAvgPerDay: 100, referenceDays: 28, referenceAvgPerDay: 95, changePercent: 5, strongestWeekday: "Saturday", strongestWeekdayAvg: 150,
    weakestWeekday: "Monday", weakestWeekdayAvg: 70, intervalHalfWidthPercent: 12, holdoutDays: 14, maeUsed: 5, maeNaive: 8, improvementVsNaivePercent: 37.5,
    filledMissingDays: 0, zeroDaysPercent: 0,
  };

  it("trust verdict: a grid of 2,880 cases, edges included", () => {
    let cases = 0;
    for (const methodUsed of ["ets", "naive", "NAIVE", "blend"]) {
      for (const maeUsed of [null, 0, 5, 9.99, 10, 19.99, 20, 34.99, 35, 80]) {
        for (const forecastAvgPerDay of [0, 100, 2500.5]) {
          for (const improvementVsNaivePercent of [null, -3, 0, 12]) {
            for (const zeroDaysPercent of [0, 19.9, 20, 49.9, 50, 80]) {
              const facts = { ...base, methodUsed, maeUsed, forecastAvgPerDay, improvementVsNaivePercent, zeroDaysPercent };
              expect(page.trustVerdict(facts), JSON.stringify(facts)).toEqual(trustVerdict(facts));
              cases++;
            }
          }
        }
      }
    }
    expect(cases).toBe(4 * 10 * 3 * 4 * 6 - 0);
  });

  it("trust verdict: facts with missing fields (as an older export may have) do not break it", () => {
    const { maeUsed: _m, improvementVsNaivePercent: _i, zeroDaysPercent: _z, ...partial } = base;
    expect(page.trustVerdict(partial)).toMatchObject({ level: "low", errorPercent: null, beatsNaive: null, intermittent: false });
  });

  it("suggested order: the same as the reorder calculation, for the stock levels that matter", () => {
    const points = Array.from({ length: 28 }, (_, i) => ({ date: `2025-04-${String(i + 1).padStart(2, "0")}`, yhat: 100 + i, lower: 90, upper: 110 }));
    const run = { methodUsed: "ets", backtest: { ets: { mae: 5, rmse: 6.5 } }, forecast: points };
    const level = calculateReorder(run, 7, 7, 95, null, 0);
    if (!level.ok) throw new Error("expected a reorder suggestion");
    for (const onHand of [0, 0.4, 100.4, 1500, level.suggestion.orderUpToLevel, level.suggestion.orderUpToLevel + 1, 99999]) {
      const server = calculateReorder(run, 7, 7, 95, onHand, 0);
      if (!server.ok) throw new Error("expected a reorder suggestion");
      expect(page.suggestedOrder(level.suggestion.orderUpToLevel, onHand), `stock ${onHand}`).toBe(server.suggestion.suggestedOrder);
    }
  });
});

describe("the data the demo page needs", () => {
  it("the facts have what the summary shows", () => {
    for (const language of ["it", "en"]) {
      const facts = json(`data/explanation-${language}.json`).facts;
      for (const key of ["productName", "forecastTotal", "forecastAvgPerDay", "horizon", "referenceDays", "changePercent", "strongestWeekday", "weakestWeekday", "maeUsed", "methodUsed", "zeroDaysPercent"]) {
        expect(facts[key], `${language}: ${key}`).not.toBeUndefined();
      }
      expect(typeof facts.forecastTotal).toBe("number");
    }
  });

  it("there is one reorder variant for each safety margin the page offers, with the 7 and 7 days it says", () => {
    const variants = json("data/reorder.json").variants as { serviceLevelPercent: number; leadTimeDays: number; reviewDays: number; orderUpToLevel: number; onHand: number | null }[];
    expect(variants.map((v) => v.serviceLevelPercent)).toEqual([90, 95, 98, 99]);
    for (const v of variants) {
      expect([v.leadTimeDays, v.reviewDays, v.onHand]).toEqual([7, 7, null]);
      expect(v.orderUpToLevel).toBeGreaterThan(0);
    }
    expect(variants[0]!.orderUpToLevel).toBeLessThan(variants[3]!.orderUpToLevel); // more careful: more to have
  });

  it("the forecast has the error of the method it used, and the demo's verdict is one of the good ones", () => {
    const forecast = json("data/forecast.json");
    expect(forecast.backtest[forecast.methodUsed].mae).toBeGreaterThan(0);
    const trust = trustVerdict(json("data/explanation-en.json").facts) as { level: string };
    expect(["high", "medium"]).toContain(trust.level);
  });

  it("the page loads only files that exist", () => {
    const html = read("index.html");
    expect(html).toContain('<script src="summary.js"></script>');
    const files = [...html.matchAll(/(?:src|href)="((?!https?:|#|mailto:)[^"]+)"/g)].map((m) => m[1]!).concat([...html.matchAll(/getJson\('([^']+)'/g)].map((m) => m[1]!));
    expect(files.length).toBeGreaterThan(6);
    for (const file of files) expect(existsSync(docs(file)), file).toBe(true);
  });
});
