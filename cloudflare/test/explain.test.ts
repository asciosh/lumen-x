import { describe, expect, it } from "vitest";
import { buildFacts, explain, normalizeLanguage, weekdayName, type ExplanationFacts, type RunForFacts } from "../src/engine/explain";
import { dayNumber, isoFromDayNumber } from "../src/engine/dates";
import type { BacktestMetrics, SalePoint } from "../src/engine/types";

const day = (start: string, i: number) => isoFromDayNumber(dayNumber(start) + i);
const sales = (days: number, quantity: number): SalePoint[] => Array.from({ length: days }, (_, i) => ({ date: day("2025-01-01", i), quantity }));

/** 2025-03-01 is a Saturday. */
const points = (days: number, yhat: (iso: string) => number) =>
  Array.from({ length: days }, (_, i) => {
    const date = day("2025-03-01", i);
    const y = yhat(date);
    return { date, yhat: y, lower: y - 10, upper: y + 10 };
  });

const run = (forecast: ReturnType<typeof points>, methodUsed = "ets", backtest: Record<string, BacktestMetrics> = {}): RunForFacts => ({
  methodUsed,
  holdoutDays: 14,
  filledMissingDays: 2,
  backtest,
  forecast,
});

describe("weekdays", () => {
  it("knows the day of the week", () => {
    expect(weekdayName("2025-03-01")).toBe("Saturday");
    expect(weekdayName("2025-03-02")).toBe("Sunday");
    expect(weekdayName("1970-01-01")).toBe("Thursday");
    expect(weekdayName("2024-02-29")).toBe("Thursday");
    expect(weekdayName("1969-12-31")).toBe("Wednesday"); // before 1970 too
  });
});

describe("normalizeLanguage", () => {
  it("empty is Italian, it and en are kept, the rest is refused", () => {
    expect(normalizeLanguage(undefined)).toBe("it");
    expect(normalizeLanguage(null)).toBe("it");
    expect(normalizeLanguage("  ")).toBe("it");
    expect(normalizeLanguage(" EN ")).toBe("en");
    expect(normalizeLanguage("it")).toBe("it");
    expect(normalizeLanguage("fr")).toBeNull();
  });
});

describe("buildFacts (same cases as the .NET FactsBuilderTests)", () => {
  it("change percent compares the forecast with recent history", () => {
    const facts = buildFacts("Caffè", sales(60, 100), run(points(28, () => 120)));
    expect(facts.horizon).toBe(28);
    expect(facts.forecastTotal).toBeCloseTo(120 * 28, 6);
    expect(facts.referenceDays).toBe(28);
    expect(facts.referenceAvgPerDay).toBeCloseTo(100, 6);
    expect(facts.changePercent).toBeCloseTo(20, 6);
    expect(facts.filledMissingDays).toBe(2);
    expect(facts.historyDays).toBe(60);
    expect(facts.historyEnd).toBe("2025-03-01");
  });

  it("finds the strongest weekday when the difference is significant", () => {
    const facts = buildFacts("Caffè", sales(60, 100), run(points(14, (d) => (weekdayName(d) === "Saturday" ? 200 : 100))));
    expect(facts.strongestWeekday).toBe("Saturday");
    expect(facts.strongestWeekdayAvg).toBeCloseTo(200, 6);
    expect(facts.weakestWeekdayAvg).toBeCloseTo(100, 6);
  });

  it("breaks ties between weekdays in favour of the first day of the week (Sunday first)", () => {
    const facts = buildFacts("x", sales(60, 100), run(points(14, (d) => (["Saturday", "Monday"].includes(weekdayName(d)) ? 200 : 100))));
    expect(facts.strongestWeekday).toBe("Monday");
    expect(facts.weakestWeekday).toBe("Sunday");
  });

  it("leaves the weekday out for a horizon shorter than a week or a flat forecast", () => {
    expect(buildFacts("x", sales(60, 100), run(points(5, (d) => (weekdayName(d) === "Saturday" ? 200 : 100)))).strongestWeekday).toBeNull();
    expect(buildFacts("x", sales(60, 100), run(points(28, () => 100))).strongestWeekday).toBeNull();
  });

  it("computes the improvement over naive from the backtest MAE", () => {
    const backtest = { naive: { mae: 5, rmse: 6.5 }, ets: { mae: 3, rmse: 4 } };
    const facts = buildFacts("x", sales(60, 100), run(points(28, () => 100), "ets", backtest));
    expect(facts.maeUsed).toBeCloseTo(3, 6);
    expect(facts.maeNaive).toBeCloseTo(5, 6);
    expect(facts.improvementVsNaivePercent).toBeCloseTo(40, 6);
  });

  it("reports no improvement when naive was used", () => {
    const facts = buildFacts("x", sales(60, 100), run(points(28, () => 100), "naive", { naive: { mae: 5, rmse: 6.5 } }));
    expect(facts.improvementVsNaivePercent).toBeNull();
  });

  it("matches the method names without caring for the case", () => {
    const facts = buildFacts("x", sales(60, 100), run(points(28, () => 100), "NAIVE", { Naive: { mae: 5, rmse: 6.5 } }));
    expect(facts.maeUsed).toBe(5);
    expect(facts.improvementVsNaivePercent).toBeNull();
  });

  it("zero recent sales give no change percent", () => {
    expect(buildFacts("x", sales(60, 0), run(points(28, () => 50))).changePercent).toBeNull();
  });

  it("counts the days without sales", () => {
    const s = Array.from({ length: 60 }, (_, i) => ({ date: day("2025-01-01", i), quantity: i < 15 ? 0 : 100 }));
    expect(buildFacts("Libri", s, run(points(28, () => 100))).zeroDaysPercent).toBeCloseTo(25, 6);
    expect(buildFacts("Pane", sales(60, 100), run(points(28, () => 100))).zeroDaysPercent).toBeCloseTo(0, 6);
  });

  it("uses the whole history when it is shorter than the horizon, and cuts a long name", () => {
    const facts = buildFacts("n".repeat(150), sales(10, 100), run(points(28, () => 100)));
    expect(facts.referenceDays).toBe(10);
    expect(facts.productName).toHaveLength(100);
  });

  it("refuses an empty history or an empty forecast", () => {
    expect(() => buildFacts("x", [], run(points(28, () => 1)))).toThrow();
    expect(() => buildFacts("x", sales(10, 1), run([]))).toThrow();
  });

  it("does not depend on the order of the points", () => {
    const shuffled = [...points(28, () => 120)].reverse();
    expect(buildFacts("x", [...sales(60, 100)].reverse(), run(shuffled)).changePercent).toBeCloseTo(20, 6);
  });
});

/** The facts used by the .NET TemplateExplainerTests (ExplanationTestData.Facts()). */
const FACTS: ExplanationFacts = {
  productName: "Caffè",
  historyDays: 90,
  historyEnd: "2025-03-31",
  methodUsed: "ets",
  horizon: 28,
  forecastStart: "2025-04-01",
  forecastEnd: "2025-04-28",
  forecastTotal: 3360,
  forecastAvgPerDay: 120,
  referenceDays: 28,
  referenceAvgPerDay: 100,
  changePercent: 20,
  strongestWeekday: "Saturday",
  strongestWeekdayAvg: 150,
  weakestWeekday: "Monday",
  weakestWeekdayAvg: 90,
  intervalHalfWidthPercent: 12,
  holdoutDays: 14,
  maeUsed: 3,
  maeNaive: 5,
  improvementVsNaivePercent: 40,
  filledMissingDays: 0,
  zeroDaysPercent: 0,
};

describe("explain (same cases as the .NET TemplateExplainerTests)", () => {
  it("Italian: words and number format", () => {
    const text = explain(FACTS, "it");
    for (const piece of ["Caffè", "3.360", "28 giorni", "20% in più", "sabato", "lunedì", "naive"]) expect(text).toContain(piece);
  });

  it("English: words and number format", () => {
    const text = explain(FACTS, "en");
    for (const piece of ["Caffè", "3,360", "28 days", "20% higher", "Saturday", "naive"]) expect(text).toContain(piece);
  });

  it("a negative change is described as lower, a small one as in line", () => {
    expect(explain({ ...FACTS, changePercent: -15 }, "it")).toContain("15% in meno");
    expect(explain({ ...FACTS, changePercent: -15 }, "en")).toContain("15% lower");
    expect(explain({ ...FACTS, changePercent: 0.5 }, "it")).toContain("in linea");
    expect(explain({ ...FACTS, changePercent: 0.5 }, "en")).toContain("in line");
  });

  it("missing optional facts are simply left out", () => {
    const text = explain({ ...FACTS, changePercent: null, strongestWeekday: null, strongestWeekdayAvg: null, weakestWeekday: null, weakestWeekdayAvg: null, intervalHalfWidthPercent: null, maeUsed: null, improvementVsNaivePercent: null }, "it");
    expect(text).toContain("Caffè");
    for (const piece of ["giorno più forte", "intervallo", "verifica"]) expect(text).not.toContain(piece);
  });

  it("mentions the filled days, the intermittent series and the blend", () => {
    expect(explain({ ...FACTS, filledMissingDays: 3 }, "it")).toContain("3 giorni di dati");
    expect(explain({ ...FACTS, filledMissingDays: 3 }, "en")).toContain("3 days of history");
    const many = { ...FACTS, zeroDaysPercent: 25 };
    expect(explain(many, "it")).toContain("25% dei giorni ha vendite pari a zero");
    expect(explain(many, "it")).toContain("poco affidabile");
    expect(explain(many, "en")).toContain("25% of the days");
    expect(explain(many, "en")).toContain("intermittent");
    expect(explain({ ...FACTS, zeroDaysPercent: 5 }, "it")).not.toContain("zero");
    expect(explain({ ...FACTS, zeroDaysPercent: 5 }, "en")).not.toContain("zero sales");
    const blend = { ...FACTS, methodUsed: "blend" };
    expect(explain(blend, "it")).toContain("media di ETS e LightGBM");
    expect(explain(blend, "it")).not.toContain("blend");
    expect(explain(blend, "en")).toContain("average of ETS and LightGBM");
  });

  it("an unknown language falls back to Italian", () => {
    expect(explain(FACTS, "xx")).toContain("prevedo");
  });
});

describe("explain: the complete text (checked by hand against the templates of TemplateExplainer.cs)", () => {
  it("Italian", () => {
    expect(explain(FACTS, "it")).toBe(
      "Per «Caffè» prevedo circa 3.360 unità su 28 giorni (dal 01/04/2025 al 28/04/2025), cioè 120 al giorno. " +
        "Sono il 20% in più rispetto agli ultimi 28 giorni (100 al giorno). " +
        "Il giorno più forte è sabato (circa 150 unità), il più debole lunedì (circa 90,0). " +
        "L'intervallo di confidenza è di circa ±12% attorno al valore centrale: più è ampio, più la previsione è incerta. " +
        "Nella verifica sugli ultimi 14 giorni il metodo scelto (ets) ha sbagliato in media di 3,0 unità al giorno, il 40% in meno del metodo semplice di confronto (naive).",
    );
  });

  it("English", () => {
    expect(explain(FACTS, "en")).toBe(
      "For “Caffè” I forecast about 3,360 units over 28 days (from 1 Apr 2025 to 28 Apr 2025), or 120 per day. " +
        "That is 20% higher than the last 28 days (100 per day). " +
        "The strongest day is Saturday (about 150 units) and the weakest is Monday (about 90.0). " +
        "The confidence interval is about ±12% around the central value: the wider it is, the more uncertain the forecast. " +
        "In the check on the last 14 days, the chosen method (ets) was off by 3.0 units per day on average, 40% less than the simple benchmark method (naive).",
    );
  });

  it("singular days, a single forecast day, decimals and the 'no better than naive' case", () => {
    const f = { ...FACTS, horizon: 1, forecastStart: "2025-04-01", forecastEnd: "2025-04-01", forecastTotal: 7.46, forecastAvgPerDay: 7.46, referenceDays: 1, referenceAvgPerDay: 9.04, changePercent: -17.5, holdoutDays: 1, strongestWeekday: null, strongestWeekdayAvg: null, weakestWeekday: null, weakestWeekdayAvg: null, intervalHalfWidthPercent: 4.56, improvementVsNaivePercent: -8, filledMissingDays: 1 };
    expect(explain(f, "it")).toBe(
      "Per «Caffè» prevedo circa 7,5 unità su 1 giorno (01/04/2025), cioè 7,5 al giorno. " +
        "Sono il 18% in meno rispetto agli ultimi 1 giorno (9,0 al giorno). " +
        "L'intervallo di confidenza è di circa ±4,6% attorno al valore centrale: più è ampio, più la previsione è incerta. " +
        "Nella verifica sugli ultimi 1 giorno il metodo scelto (ets) ha sbagliato in media di 3,0 unità al giorno, non meglio del metodo semplice di confronto (naive): conviene usare la previsione con cautela. " +
        "Nello storico mancavano 1 giorno di dati, stimati per interpolazione.",
    );
    expect(explain(f, "en")).toContain("(1 Apr 2025), or 7.5 per day.");
    expect(explain(f, "en")).toContain("no better than the simple benchmark method (naive), so treat the forecast with caution.");
  });
});
