import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { explain, type ExplanationFacts } from "../src/engine/explain";
import { findUnsupportedNumbers } from "../src/engine/numberGuard";

/** The facts of the .NET ExplanationTestData. */
const FACTS: ExplanationFacts = {
  productName: "Caffè", historyDays: 90, historyEnd: "2025-03-31", methodUsed: "ets", horizon: 28, forecastStart: "2025-04-01", forecastEnd: "2025-04-28",
  forecastTotal: 3360, forecastAvgPerDay: 120, referenceDays: 28, referenceAvgPerDay: 100, changePercent: 20, strongestWeekday: "Saturday", strongestWeekdayAvg: 150,
  weakestWeekday: "Monday", weakestWeekdayAvg: 90, intervalHalfWidthPercent: 12, holdoutDays: 14, maeUsed: 3, maeNaive: 5, improvementVsNaivePercent: 40,
  filledMissingDays: 0, zeroDaysPercent: 0,
};

describe("number guard (same cases as the .NET NumberGuardTests)", () => {
  it.each(["it", "en"])("the text written by the code never has unsupported numbers (%s)", (language) => {
    const variants = [FACTS, { ...FACTS, zeroDaysPercent: 25, filledMissingDays: 3, changePercent: -15 }, { ...FACTS, improvementVsNaivePercent: -8, changePercent: 0.5 }];
    for (const facts of variants) expect(findUnsupportedNumbers(explain(facts, language), facts, language)).toEqual([]);
  });

  it("the text written by the code for the real Bread facts has none either, in both languages", () => {
    for (const language of ["it", "en"]) {
      const facts = JSON.parse(readFileSync(new URL(`../../docs/data/explanation-${language}.json`, import.meta.url), "utf8")).facts as ExplanationFacts;
      expect(findUnsupportedNumbers(explain(facts, language), facts, language)).toEqual([]);
    }
  });

  it("an invented percentage is reported", () => {
    expect(findUnsupportedNumbers("Le vendite cresceranno del 35% grazie al nuovo negozio.", FACTS, "it")).toEqual(["35"]);
  });
  it("slightly rounded numbers are accepted, heavily rounded ones are not", () => {
    expect(findUnsupportedNumbers("Prevedo circa 3.350 unità.", FACTS, "it")).toEqual([]); // 3.360 within 1%
    expect(findUnsupportedNumbers("Prevedo circa 3.400 unità.", FACTS, "it")).toEqual(["3.400"]);
  });
  it("English separators are understood in English text and reported in Italian text", () => {
    expect(findUnsupportedNumbers("About 3,360 units, 20% higher.", FACTS, "en")).toEqual([]);
    expect(findUnsupportedNumbers("Circa 3,360 unità.", FACTS, "it")).not.toEqual([]);
  });
  it("the numbers in dates and in the product name are accepted", () => {
    const facts = { ...FACTS, forecastStart: "2026-05-16", forecastEnd: "2026-06-13", productName: "Pane 2024 bio 500 g" };
    expect(findUnsupportedNumbers("Dal 16 maggio 2026 al 13 giugno 2026.", facts, "it")).toEqual([]);
    expect(findUnsupportedNumbers("Per Pane 2024 bio 500 g prevedo circa 3.360 unità.", facts, "it")).toEqual([]);
  });
  it("text without digits is fine, and a repeated invented number is reported once", () => {
    expect(findUnsupportedNumbers("Testo di prova senza cifre.", FACTS, "it")).toEqual([]);
    expect(findUnsupportedNumbers("35 e poi ancora 35.", FACTS, "it")).toEqual(["35"]);
  });
  it("a malformed number (two decimal separators) is reported", () => {
    expect(findUnsupportedNumbers("Circa 1,2,3 unità", FACTS, "it")).not.toEqual([]);
  });
  it("negative changes may be written without the sign", () => {
    expect(findUnsupportedNumbers("Il 15% in meno.", { ...FACTS, changePercent: -15 }, "it")).toEqual([]);
  });
});
