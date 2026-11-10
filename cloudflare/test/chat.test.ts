import { describe, expect, it } from "vitest";
import { answer, examples, type AskContext } from "../src/engine/chat/answer";
import { classify, type DataIntent } from "../src/engine/chat/intent";
import { monthsMentioned, parseFutureDays, parseLast, resolve } from "../src/engine/chat/period";
import { detectLanguage, normalize, tokens } from "../src/engine/chat/question";
import { weekdayIndex, type RunForFacts } from "../src/engine/explain";
import { dayNumber, isoFromDayNumber } from "../src/engine/dates";
import type { SalePoint } from "../src/engine/types";

// ---------------------------------------------------------------------------------------------
// The same invented history as the .NET ChatTestData: 90 days from 1 January to 31 March 2026, with
// quantity = 100 + 10 x (day of the week, Sunday = 0) + 10 x (number of weeks elapsed).
// Forecast: 28 days from 1 April 2026 at 150 units (band 140-160), method error (MAE 8, RMSE 10).
// ---------------------------------------------------------------------------------------------
const FIRST_DAY = "2026-01-01";
const LAST_DAY = "2026-03-31";
const addDays = (iso: string, n: number) => isoFromDayNumber(dayNumber(iso) + n);

const salesHistory = (days = 90): SalePoint[] =>
  Array.from({ length: days }, (_, i) => {
    const date = addDays(FIRST_DAY, i);
    return { date, quantity: 100 + 10 * weekdayIndex(date) + 10 * Math.floor(i / 7) };
  });
const constantSales = (days: number, quantity: number): SalePoint[] => Array.from({ length: days }, (_, i) => ({ date: addDays(FIRST_DAY, i), quantity }));

function forecast(days = 28, method = "blend", withNaive = true): RunForFacts {
  const backtest: RunForFacts["backtest"] = { [method]: { mae: 8, rmse: 10 } };
  if (withNaive && method !== "naive") backtest["naive"] = { mae: 12, rmse: 15 };
  return {
    methodUsed: method,
    holdoutDays: 28,
    filledMissingDays: 0,
    backtest,
    forecast: Array.from({ length: days }, (_, i) => ({ date: addDays("2026-04-01", i), yhat: 150, lower: 140, upper: 160 })),
  };
}

const context = (options: { withForecast?: boolean; zeroDaysPercent?: number; sales?: SalePoint[] } = {}): AskContext => ({
  productName: "Pane",
  sales: options.sales ?? salesHistory(),
  forecast: options.withForecast === false ? null : forecast(),
  zeroDaysPercent: options.zeroDaysPercent ?? 0,
});

const ask = (question: string, language = "it", ctx: AskContext = context()) => answer(question, language, ctx).text;

// ------------------------------------------------------------------ QuestionText
describe("question text", () => {
  it("removes accents and punctuation", () => {
    expect(normalize("Qual è il giorno più forte?")).toBe("qual e il giorno piu forte");
  });
  it("splits at apostrophes and collapses spaces", () => {
    expect(normalize("  L'ultimo    MESE!! ")).toBe("l ultimo mese");
  });
  it("keeps digits", () => {
    expect(normalize("Ultimi 30 giorni?")).toBe("ultimi 30 giorni");
  });
  it("tokens are the words of the normalized text", () => {
    expect(tokens("ultimi 30 giorni")).toEqual(["ultimi", "30", "giorni"]);
    expect(tokens("")).toEqual([]);
  });
  it("every Italian example is recognized as Italian, every English one as English", () => {
    for (const q of examples("it")) expect(detectLanguage(normalize(q)), q).toBe("it");
    for (const q of examples("en")) expect(detectLanguage(normalize(q)), q).toBe("en");
  });
  it("an unclear language defaults to Italian", () => {
    expect(detectLanguage(normalize("ciao"))).toBe("it");
  });
  it("copes with strange text (emoji, symbols, other alphabets)", () => {
    expect(normalize("📈 ¿Cuánto vendí?")).toBe("cuanto vendi");
    expect(normalize("売上は？")).toBe("売上は");
    expect(normalize("")).toBe("");
  });
});

// ------------------------------------------------------------------ IntentClassifier
const classified = (q: string) => classify(normalize(q)).intent;

describe("intent classifier", () => {
  it.each<[string, DataIntent]>([
    ["Quanto ho venduto negli ultimi 30 giorni?", "sales_total"],
    ["Come vanno le vendite rispetto al mese scorso?", "compare_periods"],
    ["Qual è il giorno più forte della settimana?", "weekday_pattern"],
    ["Quanto prevedo di vendere nelle prossime 2 settimane?", "forecast_total"],
    ["Cosa conviene ordinare?", "reorder"],
    ["Quanto è affidabile la previsione?", "reliability"],
    ["Spiegami la previsione", "summary"],
    ["Qual è stato il giorno record?", "peak_day"],
    ["How much did I sell in the last 30 days?", "sales_total"],
    ["How are sales doing compared to last month?", "compare_periods"],
    ["Which day of the week sells best?", "weekday_pattern"],
    ["How much will I sell in the next 2 weeks?", "forecast_total"],
    ["What should I order?", "reorder"],
    ["How reliable is the forecast?", "reliability"],
    ["Explain the forecast", "summary"],
    ["What was my record day?", "peak_day"],
  ])("example: %s -> %s", (question, expected) => {
    expect(classified(question)).toBe(expected);
  });

  it.each<[string, DataIntent]>([
    ["Quanto ho venduto a marzo?", "sales_total"],
    ["Quante unità vendo in media al giorno?", "sales_total"],
    ["Quanto devo ordinare nelle prossime settimane?", "reorder"],
    ["Quanto è precisa la previsione?", "reliability"],
    ["Dammi una sintesi", "summary"],
    ["Come andranno le vendite il prossimo mese?", "forecast_total"],
    ["Come è andato l'ultimo mese rispetto al precedente?", "compare_periods"],
    ["Qual è il giorno migliore della settimana?", "weekday_pattern"],
    ["Qual è stato il giorno migliore?", "peak_day"],
    ["Qual è il picco di vendite?", "peak_day"],
    ["Come vanno i sabati?", "weekday_pattern"],
    ["Should I trust the numbers?", "reliability"],
    ["quanto sbaglia il modello?", "reliability"],
    ["Quanto ho incassato a luglio?", "sales_total"],
    ["Quanto ho fatturato a marzo?", "sales_total"],
    ["What is my income?", "sales_total"],
    ["Come vanno i ricavi rispetto al mese scorso?", "compare_periods"],
    ["Quanto incasserò nelle prossime 2 settimane?", "forecast_total"],
  ])("variation: %s -> %s", (question, expected) => {
    expect(classified(question)).toBe(expected);
  });

  it.each(["Che tempo fa oggi?", "ciao", "Tell me a joke", "???", ""])("outside the list, not guessed: %j", (question) => {
    expect(classify(normalize(question))).toEqual({ intent: "unknown", score: 0 });
  });

  it.each<[string, DataIntent]>([
    ["Quanto è affidabile la previsione dei prossimi giorni?", "reliability"],
    ["How reliable is the forecast for the next 2 weeks?", "reliability"],
    ["Spiegami la previsione dei prossimi giorni", "summary"],
    ["Cosa conviene ordinare per le prossime settimane in base alla previsione?", "reorder"],
  ])("more specific questions win over generic ones: %s", (question, expected) => {
    expect(classified(question)).toBe(expected);
  });
});

// ------------------------------------------------------------------ PeriodParser
describe("period parser", () => {
  it.each<[string, number]>([
    ["Quanto ho venduto negli ultimi 30 giorni?", 30],
    ["nell'ultimo mese", 30],
    ["negli ultimi tre mesi", 90],
    ["ultime due settimane", 14],
    ["in the last 2 weeks", 14],
    ["last month", 30],
    ["last week", 7],
    ["ultimo anno", 365],
    ["l'ultimo giorno", 1],
  ])("last period: %s = %s days", (question, expectedDays) => {
    expect(parseLast(normalize(question))).toMatchObject({ kind: "last_days", days: expectedDays });
  });

  it("a plural unit without a number is not guessed, and no period means none", () => {
    expect(parseLast(normalize("gli ultimi giorni del mese")).kind).toBe("none");
    expect(parseLast(normalize("Quanto ho venduto?")).kind).toBe("none");
  });

  it("a month name is a calendar month, with the year if it is next to it", () => {
    expect(parseLast(normalize("Quanto ho venduto a marzo?"))).toMatchObject({ kind: "calendar_month", month: 3, year: 0 });
    expect(parseLast(normalize("vendite di marzo 2025"))).toMatchObject({ month: 3, year: 2025 });
    expect(parseLast(normalize("What did I sell in February?")).month).toBe(2);
  });

  it("lists each month once, in order", () => {
    expect(monthsMentioned(normalize("aprile rispetto a marzo, aprile"))).toEqual([4, 3]);
  });

  it("does not take words like 'constructor' for months or numbers", () => {
    expect(monthsMentioned(normalize("constructor toString hasOwnProperty"))).toEqual([]);
    expect(parseLast(normalize("last constructor days")).kind).toBe("none");
  });

  it.each<[string, number]>([
    ["nelle prossime 2 settimane", 14],
    ["next week", 7],
    ["next 2 weeks", 14],
    ["prossimi 10 giorni", 10],
    ["il prossimo mese", 30],
  ])("future period: %s = %s days", (question, expectedDays) => {
    expect(parseFutureDays(normalize(question))).toBe(expectedDays);
  });

  it.each(["nelle prossime settimane", "Come andranno le vendite?", "coming days"])("a future period without a clear length is null: %s", (question) => {
    expect(parseFutureDays(normalize(question))).toBeNull();
  });

  it("caps a huge number of days", () => {
    expect(parseLast(normalize("ultimi 999 giorni")).days).toBe(999);
    expect(parseLast(normalize("ultimi 999 mesi")).days).toBe(3650);
  });

  // ---- resolution into real dates (last day of data: 31 March 2026) ----
  it("last days end on the last day of data", () => {
    expect(resolve({ kind: "last_days", days: 30, year: 0, month: 0 }, LAST_DAY, 90)).toMatchObject({ start: "2026-03-02", end: LAST_DAY });
  });

  it("no period uses the default length", () => {
    expect(resolve({ kind: "none", days: 0, year: 0, month: 0 }, LAST_DAY, 7)).toMatchObject({ start: "2026-03-25", end: LAST_DAY });
  });

  it.each<[number, number, string, string]>([
    [3, 2026, "2026-03-01", "2026-03-31"], // March: the current month
    [2, 2026, "2026-02-01", "2026-02-28"], // February 2026
    [12, 2025, "2025-12-01", "2025-12-31"], // December has not arrived yet: the one from the previous year
    [4, 2025, "2025-04-01", "2025-04-30"], // April: still in the future, so April 2025
  ])("a month without a year is the latest one not after the last day: %s", (month, _year, start, end) => {
    expect(resolve({ kind: "calendar_month", days: 0, year: 0, month }, LAST_DAY, 30)).toMatchObject({ start, end, kind: "calendar_month" });
  });

  it("a month with an explicit year is used as given (2024 is a leap year)", () => {
    expect(resolve({ kind: "calendar_month", days: 0, year: 2024, month: 2 }, LAST_DAY, 30)).toMatchObject({ start: "2024-02-01", end: "2024-02-29" });
  });
});

// ------------------------------------------------------------------ DataQuestionAnswer
describe("sales in a period", () => {
  it("the last 30 days are summed from the last day of data", () => {
    expect(ask("Quanto ho venduto negli ultimi 30 giorni?")).toBe("Dal 02/03/2026 al 31/03/2026 (30 giorni) hai venduto 6.930 unità, cioè 231 al giorno.");
  });
  it("a named month uses the calendar month", () => {
    expect(ask("Quanto ho venduto a febbraio?")).toBe("A febbraio 2026 (28 giorni) hai venduto 5.300 unità, cioè 189 al giorno.");
    expect(ask("Quanto ho venduto a gennaio 2026?")).toBe("A gennaio 2026 (31 giorni) hai venduto 4.630 unità, cioè 149 al giorno.");
  });
  it("the last three months cover the whole history", () => {
    expect(ask("Quanto ho venduto negli ultimi 3 mesi?")).toBe("Dal 01/01/2026 al 31/03/2026 (90 giorni) hai venduto 17.040 unità, cioè 189 al giorno.");
  });
  it("without a period it defaults to the last 30 days", () => {
    expect(ask("Quanto ho venduto?")).toBe(ask("Quanto ho venduto negli ultimi 30 giorni?"));
  });
  it("a period without data says where the data is", () => {
    expect(ask("Quanto ho venduto a dicembre?")).toBe("Non ho vendite tra il 01/12/2025 e il 31/12/2025: i dati vanno dal 01/01/2026 al 31/03/2026.");
  });
  it("English uses English formats", () => {
    expect(ask("How much did I sell in the last 30 days?", "en")).toBe("From 2 Mar 2026 to 31 Mar 2026 (30 days) you sold 6,930 units, or 231 per day.");
  });
  it("says so when the period goes beyond the data", () => {
    const text = ask("Quanto ho venduto negli ultimi 120 giorni?");
    expect(text).toContain("I dati disponibili vanno dal 01/01/2026 al 31/03/2026.");
  });
});

describe("comparison between periods", () => {
  it("with the previous week", () => {
    expect(ask("Come vanno le vendite rispetto alla settimana scorsa?")).toBe(
      "Negli ultimi 7 giorni (dal 25/03/2026 al 31/03/2026) hai venduto 1.740 unità, contro 1.670 nei 7 giorni precedenti: il 4,2% in più.",
    );
  });
  it("with the previous month", () => {
    expect(ask("Come vanno le vendite rispetto al mese scorso?")).toBe(
      "Negli ultimi 30 giorni (dal 02/03/2026 al 31/03/2026) hai venduto 6.930 unità, contro 5.680 nei 30 giorni precedenti: il 22% in più.",
    );
  });
  it("in English", () => {
    expect(ask("How are sales doing compared to last week?", "en")).toBe(
      "In the last 7 days (from 25 Mar 2026 to 31 Mar 2026) you sold 1,740 units, against 1,670 in the previous 7 days: 4.2% more.",
    );
  });
  it("says when nothing changed", () => {
    expect(ask("Come vanno le vendite rispetto alla settimana scorsa?", "it", context({ sales: constantSales(90, 100) }))).toContain("praticamente invariato");
  });
  it("says when the previous period had no sales", () => {
    const sales = Array.from({ length: 14 }, (_, i) => ({ date: addDays(FIRST_DAY, i), quantity: i < 7 ? 0 : 10 }));
    expect(ask("Come vanno le vendite rispetto alla settimana scorsa?", "it", context({ sales }))).toContain("nel periodo precedente non risultano vendite");
  });
  it("mentions missing days and shows a decrease", () => {
    const sales = salesHistory().filter((s) => s.date !== "2026-03-27");
    const text = ask("Come vanno le vendite rispetto alla settimana scorsa?", "it", context({ sales }));
    expect(text).toContain("hai venduto 1.470 unità");
    expect(text).toContain("il 12% in meno");
    expect(text).toContain("Giorni con dati: 6 e 7.");
  });
  it("needs twice the period of history", () => {
    expect(ask("Come vanno le vendite rispetto al mese scorso?", "it", context({ sales: salesHistory(20) }))).toBe(
      "Per confrontare due periodi da 30 giorni servono almeno 60 giorni di storico: ne ho 20 giorni.",
    );
  });
  it("comparing two named months is not supported yet", () => {
    expect(ask("Vendite di aprile rispetto a marzo")).toContain("non è ancora supportato");
    expect(ask("Sales of April compared to March", "en")).toContain("not supported yet");
  });
});

describe("weekdays and record", () => {
  it("strongest and weakest weekday over the last 12 weeks", () => {
    expect(ask("Qual è il giorno più forte della settimana?")).toBe("Guardando gli ultimi 84 giorni di dati, il giorno più forte è sabato (in media 225 unità) e il più debole domenica (165).");
    expect(ask("Which day of the week sells best?", "en")).toBe("Looking at the last 84 days of data, the strongest day is Saturday (about 225 units on average) and the weakest is Sunday (165).");
  });
  it("even sales have no strongest weekday", () => {
    expect(ask("Qual è il giorno più forte della settimana?", "it", context({ sales: constantSales(40, 100) }))).toContain("molto regolari");
  });
  it("needs two weeks of data", () => {
    expect(ask("Qual è il giorno più forte della settimana?", "it", context({ sales: constantSales(10, 100) }))).toContain("Servono almeno 14 giorni");
  });
  it("best and worst day over the last 90 days", () => {
    expect(ask("Qual è stato il giorno record?")).toBe("Dal 01/01/2026 al 31/03/2026 il giorno migliore è stato 28/03/2026 (sabato) con 280 unità; il peggiore 04/01/2026 (domenica) con 100.");
    expect(ask("What was my record day?", "en")).toBe("From 1 Jan 2026 to 31 Mar 2026 the best day was 28 Mar 2026 (Saturday) with 280 units; the worst was 4 Jan 2026 (Sunday) with 100.");
  });
});

describe("forecast", () => {
  it("total for the next two weeks, and over the whole horizon without a period", () => {
    expect(ask("Quanto prevedo di vendere nelle prossime 2 settimane?")).toBe("Per i prossimi 14 giorni (dal 01/04/2026 al 14/04/2026) prevedo circa 2.100 unità, 150 al giorno.");
    expect(ask("Quanto prevedo di vendere?")).toBe("Per i prossimi 28 giorni (dal 01/04/2026 al 28/04/2026) prevedo circa 4.200 unità, 150 al giorno.");
    expect(ask("How much will I sell in the next 2 weeks?", "en")).toBe("For the next 14 days (from 1 Apr 2026 to 14 Apr 2026) I forecast about 2,100 units, 150 per day.");
  });
  it("longer than the horizon says so", () => {
    const text = ask("Quanto prevedo di vendere nei prossimi 60 giorni?");
    expect(text).toContain("prevedo circa 4.200 unità");
    expect(text.endsWith("Il forecast copre solo 28 giorni: per andare oltre ricalcolalo con un orizzonte più lungo.")).toBe(true);
  });
  it.each(["Quanto prevedo di vendere nelle prossime 2 settimane?", "Cosa conviene ordinare?", "Quanto è affidabile la previsione?", "Spiegami la previsione"])(
    "says when there is no forecast: %s",
    (question) => {
      expect(ask(question, "it", context({ withForecast: false }))).toBe("Per questo prodotto non c'è ancora un forecast: calcolalo nella sezione Previsione e poi chiedimi pure.");
    },
  );
  it("many zero days add a warning", () => {
    expect(ask("Quanto prevedo di vendere nelle prossime 2 settimane?", "it", context({ zeroDaysPercent: 25 })).endsWith("Attenzione: molti giorni a zero nello storico, quindi la previsione è poco affidabile.")).toBe(true);
  });
});

describe("reorder", () => {
  it("uses the default lead time, review and service level", () => {
    const text = ask("Cosa conviene ordinare?");
    expect(text.startsWith("Per coprire i prossimi 14 giorni (7 di consegna e 7 tra un ordine e l'altro) con un livello di servizio del 95%:")).toBe(true);
    expect(text).toContain("domanda prevista 2.100");
    expect(text).toContain("scorta di sicurezza 61,5"); // 1.6449 x 10 x sqrt(14)
    expect(text).toContain("livello massimo di circa 2.162 unità");
    expect(text).toContain("riquadro Riordino");
  });
  it("in English", () => {
    const text = ask("What should I order?", "en");
    expect(text).toContain("To cover the next 14 days (7 of delivery and 7 between orders) at a 95% service level");
    expect(text).toContain("expected demand 2,100, safety stock 61.5");
    expect(text).toContain("maximum level of about 2,162 units");
  });
  it("a forecast shorter than the period explains what to do", () => {
    const text = ask("Cosa conviene ordinare?", "it", { ...context(), forecast: forecast(10) });
    expect(text).toContain("orizzonte");
    expect(text).toContain("14 giorni");
  });
});

describe("reliability and explanation", () => {
  it("reports method, error, range and gain over the naive", () => {
    expect(ask("Quanto è affidabile la previsione?")).toBe(
      "Il metodo usato è la media di ETS e LightGBM. " +
        "Nei giorni di verifica ha sbagliato in media di 8,0 unità al giorno, circa il 5,3% delle vendite previste. " +
        "La fascia probabile è di circa ±6,7%. " +
        "È il 33% in meno del metodo semplice di confronto (naive).",
    );
  });
  it("without a naive backtest there is no comparison", () => {
    const text = ask("Quanto è affidabile la previsione?", "it", { ...context(), forecast: forecast(28, "blend", false) });
    expect(text).not.toContain("naive");
    expect(text).toContain("8,0 unità al giorno");
  });
  it("warns about intermittent series", () => {
    expect(ask("Quanto è affidabile la previsione?", "it", context({ zeroDaysPercent: 30 }))).toContain("molti giorni a zero");
  });
  it("the summary is the rule-based explanation of the forecast", () => {
    expect(ask("Spiegami la previsione").startsWith("Per «Pane» prevedo circa 4.200 unità su 28 giorni")).toBe(true);
    expect(ask("Explain the forecast", "en").startsWith("For “Pane” I forecast about 4,200 units over 28 days")).toBe(true);
  });
});

describe("edge cases", () => {
  it("an unknown question says what can be asked and offers examples", () => {
    const a = answer("Che tempo fa oggi?", "it", context());
    expect(a.understood).toBe(false);
    expect(a.intent).toBe("unknown");
    expect(a.text.startsWith("Non ho capito la domanda.")).toBe(true);
    expect(a.suggestions).toEqual(examples("it"));
    expect(a.suggestions).toHaveLength(8);
    const en = answer("Tell me a joke", "en", context());
    expect(en.text.startsWith("I did not understand the question.")).toBe(true);
    expect(en.suggestions).toEqual(examples("en"));
  });
  it("without any sales the answer asks for an import", () => {
    expect(ask("Quanto ho venduto negli ultimi 30 giorni?", "it", context({ sales: [] }))).toContain("importa un CSV");
    expect(ask("How much did I sell?", "en", context({ sales: [] }))).toContain("import a CSV");
  });
  it.each(["it", "en"])("every example question is understood and answered (%s)", (language) => {
    for (const question of examples(language)) {
      const a = answer(question, language, context());
      expect(a.understood, question).toBe(true);
      expect(a.intent, question).not.toBe("unknown");
      expect(a.text.trim().length, question).toBeGreaterThan(0);
      expect(a.suggestions, question).toEqual([]);
    }
  });
  it("reports which question it understood", () => {
    expect(answer("Cosa conviene ordinare?", "it", context()).intent).toBe("reorder");
    expect(answer("Qual è il picco di vendite?", "it", context()).intent).toBe("peak_day");
  });
  it("does not depend on the order of the sales", () => {
    const shuffled = [...salesHistory()].reverse();
    expect(ask("Quanto ho venduto negli ultimi 30 giorni?", "it", context({ sales: shuffled }))).toBe(ask("Quanto ho venduto negli ultimi 30 giorni?"));
  });
  it("survives strange input without throwing", () => {
    for (const q of ["", "   ", "💥", "constructor", "__proto__", "a".repeat(5000), "ultimi 0 giorni", "ultimi 999999 giorni", "prossimi 0 giorni"]) {
      expect(() => answer(q, "it", context()), q).not.toThrow();
      expect(() => answer(q, "en", context({ withForecast: false })), q).not.toThrow();
    }
  });
});

describe("money questions", () => {
  it("are answered with units and an honest note", () => {
    expect(ask("Quanto ho incassato a febbraio?")).toBe(
      "Non conosco i prezzi, quindi non posso parlare di incassi: ti rispondo con le unità vendute. A febbraio 2026 (28 giorni) hai venduto 5.300 unità, cioè 189 al giorno.",
    );
    expect(ask("How much revenue did I make in the last 30 days?", "en")).toBe(
      "I do not have prices, so I cannot talk about revenue: here are the units sold. From 2 Mar 2026 to 31 Mar 2026 (30 days) you sold 6,930 units, or 231 per day.",
    );
  });
  it("the note also applies to forecast answers", () => {
    const text = ask("Quanto incasserò nelle prossime 2 settimane?");
    expect(text.startsWith("Non conosco i prezzi")).toBe(true);
    expect(text).toContain("prevedo circa 2.100 unità");
  });
  it("questions without money words have no note, and reliability answers never get it", () => {
    expect(ask("Quanto ho venduto a febbraio?")).not.toContain("prezzi");
    expect(ask("Quanto è affidabile il guadagno previsto?")).not.toContain("Non conosco i prezzi");
  });
});
