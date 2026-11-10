import { dayNumber } from "./dates";
import type { BacktestMetrics, ForecastPoint, SalePoint } from "./types";

/** Facts computed by the code from sales and forecast: the only input of the explanation. */
export interface ExplanationFacts {
  productName: string;
  historyDays: number;
  historyEnd: string;
  methodUsed: string;
  horizon: number;
  forecastStart: string;
  forecastEnd: string;
  forecastTotal: number;
  forecastAvgPerDay: number;
  referenceDays: number;
  referenceAvgPerDay: number;
  changePercent: number | null;
  /** English name of the weekday ("Saturday"), as in the .NET backend. */
  strongestWeekday: string | null;
  strongestWeekdayAvg: number | null;
  weakestWeekday: string | null;
  weakestWeekdayAvg: number | null;
  intervalHalfWidthPercent: number | null;
  holdoutDays: number;
  maeUsed: number | null;
  maeNaive: number | null;
  improvementVsNaivePercent: number | null;
  filledMissingDays: number;
  zeroDaysPercent: number;
}

/** What the facts need from a forecast run. */
export interface RunForFacts {
  methodUsed: string;
  holdoutDays: number;
  filledMissingDays: number;
  backtest: Record<string, BacktestMetrics>;
  forecast: readonly ForecastPoint[];
}

export type Language = "it" | "en";

/** Empty means Italian (as in the .NET backend); null if the language is not supported. */
export function normalizeLanguage(value: string | null | undefined): Language | null {
  if (value === null || value === undefined || value.trim().length === 0) return "it";
  const v = value.trim().toLowerCase();
  return v === "it" || v === "en" ? v : null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** 0 = Sunday. 1970-01-01 (day 0) was a Thursday. */
export const weekdayIndex = (iso: string): number => (((dayNumber(iso) + 4) % 7) + 7) % 7;
export const weekdayName = (iso: string): string => WEEKDAYS[weekdayIndex(iso)]!;

const INTERMITTENT_THRESHOLD_PERCENT = 20;

function maeOf(backtest: Record<string, BacktestMetrics> | null | undefined, method: string): number | null {
  if (!backtest) return null;
  for (const [key, value] of Object.entries(backtest)) {
    if (key.toLowerCase() === method.toLowerCase()) return value.mae;
  }
  return null;
}

export function buildFacts(productName: string, sales: readonly SalePoint[], run: RunForFacts): ExplanationFacts {
  if (sales.length === 0) throw new Error("Sales are needed.");
  if (run.forecast.length === 0) throw new Error("The forecast is empty.");

  const history = [...sales].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const points = [...run.forecast].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const horizon = points.length;
  const forecastTotal = points.reduce((s, p) => s + p.yhat, 0);
  const forecastAvg = forecastTotal / horizon;

  // Comparison with recent history: same length as the horizon (at most the whole history).
  const referenceDays = Math.min(horizon, history.length);
  const referenceAvg = history.slice(history.length - referenceDays).reduce((s, p) => s + p.quantity, 0) / referenceDays;
  const change = referenceAvg > 0 ? ((forecastAvg - referenceAvg) / referenceAvg) * 100 : null;

  // Strongest / weakest weekday: only with at least a week of forecast and a significant difference, otherwise it is noise.
  let strongest: string | null = null;
  let weakest: string | null = null;
  let strongestAvg: number | null = null;
  let weakestAvg: number | null = null;
  if (horizon >= 7 && forecastAvg > 0) {
    const sums = new Map<number, { sum: number; n: number }>();
    for (const p of points) {
      const day = weekdayIndex(p.date);
      const entry = sums.get(day) ?? { sum: 0, n: 0 };
      entry.sum += p.yhat;
      entry.n += 1;
      sums.set(day, entry);
    }
    const byDay = [...sums.entries()].map(([day, e]) => ({ day, avg: e.sum / e.n }));
    const top = [...byDay].sort((a, b) => b.avg - a.avg || a.day - b.day)[0]!;
    const bottom = [...byDay].sort((a, b) => a.avg - b.avg || a.day - b.day)[0]!;
    if (top.day !== bottom.day && (top.avg - bottom.avg) / forecastAvg > 0.05) {
      strongest = WEEKDAYS[top.day]!;
      strongestAvg = top.avg;
      weakest = WEEKDAYS[bottom.day]!;
      weakestAvg = bottom.avg;
    }
  }

  const halfWidth = forecastAvg > 0 ? (points.reduce((s, p) => s + (p.upper - p.lower) / 2, 0) / horizon / forecastAvg) * 100 : null;

  const maeUsed = maeOf(run.backtest, run.methodUsed);
  const maeNaive = maeOf(run.backtest, "naive");
  let improvement: number | null = null;
  const usedIsNaive = run.methodUsed.toLowerCase() === "naive";
  if (!usedIsNaive && maeUsed !== null && maeNaive !== null && maeNaive > 0) {
    improvement = ((maeNaive - maeUsed) / maeNaive) * 100;
  }

  const zeroDaysPercent = (history.filter((s) => s.quantity === 0).length * 100) / history.length;

  return {
    productName: productName.length > 100 ? productName.slice(0, 100) : productName,
    historyDays: history.length,
    historyEnd: history[history.length - 1]!.date,
    methodUsed: run.methodUsed,
    horizon,
    forecastStart: points[0]!.date,
    forecastEnd: points[points.length - 1]!.date,
    forecastTotal,
    forecastAvgPerDay: forecastAvg,
    referenceDays,
    referenceAvgPerDay: referenceAvg,
    changePercent: change,
    strongestWeekday: strongest,
    strongestWeekdayAvg: strongestAvg,
    weakestWeekday: weakest,
    weakestWeekdayAvg: weakestAvg,
    intervalHalfWidthPercent: halfWidth,
    holdoutDays: run.holdoutDays,
    maeUsed,
    maeNaive,
    improvementVsNaivePercent: improvement,
    filledMissingDays: run.filledMissingDays,
    zeroDaysPercent,
  };
}

// ---------- formatting: explicit number formats, never the language of the machine ----------

function formatNumber(value: number, decimals: number, it: boolean): string {
  const negative = value < 0;
  const [integer, fraction] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, it ? "." : ",");
  const text = fraction === undefined ? grouped : `${grouped}${it ? "," : "."}${fraction}`;
  return negative && Number(Math.abs(value).toFixed(decimals)) !== 0 ? `-${text}` : text;
}

/** Quantities: no decimals from 100 up, one decimal below. */
export const qty = (v: number, it: boolean): string => formatNumber(v, Math.abs(v) >= 100 ? 0 : 1, it);
/** Percentages (always positive: the sign is in the words): one decimal below 10. */
export const pct = (v: number, it: boolean): string => formatNumber(Math.abs(v), Math.abs(v) >= 10 ? 0 : 1, it);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dateIt = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
export const dateEn = (iso: string): string => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const daysIt = (n: number): string => (n === 1 ? "1 giorno" : `${n} giorni`);
export const daysEn = (n: number): string => (n === 1 ? "1 day" : `${n} days`);

const IT_WEEKDAYS: Record<string, string> = {
  Monday: "lunedì", Tuesday: "martedì", Wednesday: "mercoledì", Thursday: "giovedì", Friday: "venerdì", Saturday: "sabato", Sunday: "domenica",
};
export const weekdayIt = (english: string): string => IT_WEEKDAYS[english] ?? english;

/** "blend" is the technical name of the average of ETS and LightGBM: in the text it is written in full. */
const methodLabel = (method: string, it: boolean): string =>
  method === "blend" ? (it ? "media di ETS e LightGBM" : "average of ETS and LightGBM") : method;

/** The explanation, written by the code in Italian or English: free, offline, no AI. */
export function explain(facts: ExplanationFacts, language: string): string {
  return language === "en" ? buildEnglish(facts) : buildItalian(facts);
}

function buildItalian(f: ExplanationFacts): string {
  const parts: string[] = [];
  const range = f.forecastStart === f.forecastEnd ? dateIt(f.forecastStart) : `dal ${dateIt(f.forecastStart)} al ${dateIt(f.forecastEnd)}`;
  parts.push(`Per «${f.productName}» prevedo circa ${qty(f.forecastTotal, true)} unità su ${daysIt(f.horizon)} (${range}), cioè ${qty(f.forecastAvgPerDay, true)} al giorno.`);

  if (f.changePercent !== null) {
    const days = daysIt(f.referenceDays);
    const refAvg = qty(f.referenceAvgPerDay, true);
    if (Math.abs(f.changePercent) < 2) {
      parts.push(`È in linea con gli ultimi ${days} di vendite (${refAvg} al giorno).`);
    } else if (f.changePercent > 0) {
      parts.push(`Sono il ${pct(f.changePercent, true)}% in più rispetto agli ultimi ${days} (${refAvg} al giorno).`);
    } else {
      parts.push(`Sono il ${pct(f.changePercent, true)}% in meno rispetto agli ultimi ${days} (${refAvg} al giorno).`);
    }
  }

  if (f.strongestWeekday !== null && f.weakestWeekday !== null && f.strongestWeekdayAvg !== null && f.weakestWeekdayAvg !== null) {
    parts.push(`Il giorno più forte è ${weekdayIt(f.strongestWeekday)} (circa ${qty(f.strongestWeekdayAvg, true)} unità), il più debole ${weekdayIt(f.weakestWeekday)} (circa ${qty(f.weakestWeekdayAvg, true)}).`);
  }

  if (f.intervalHalfWidthPercent !== null) {
    parts.push(`L'intervallo di confidenza è di circa ±${pct(f.intervalHalfWidthPercent, true)}% attorno al valore centrale: più è ampio, più la previsione è incerta.`);
  }

  if (f.maeUsed !== null) {
    const check = f.holdoutDays > 0 ? `Nella verifica sugli ultimi ${daysIt(f.holdoutDays)}` : "Nella verifica";
    let sentence = `${check} il metodo scelto (${methodLabel(f.methodUsed, true)}) ha sbagliato in media di ${qty(f.maeUsed, true)} unità al giorno`;
    if (f.improvementVsNaivePercent !== null) {
      sentence +=
        f.improvementVsNaivePercent > 0
          ? `, il ${pct(f.improvementVsNaivePercent, true)}% in meno del metodo semplice di confronto (naive).`
          : ", non meglio del metodo semplice di confronto (naive): conviene usare la previsione con cautela.";
    } else {
      sentence += ".";
    }
    parts.push(sentence);
  }

  if (f.filledMissingDays > 0) {
    parts.push(`Nello storico mancavano ${daysIt(f.filledMissingDays)} di dati, stimati per interpolazione.`);
  }
  if (f.zeroDaysPercent >= INTERMITTENT_THRESHOLD_PERCENT) {
    parts.push(`Nello storico il ${pct(f.zeroDaysPercent, true)}% dei giorni ha vendite pari a zero: con una serie così discontinua la previsione è poco affidabile.`);
  }
  return parts.join(" ");
}

function buildEnglish(f: ExplanationFacts): string {
  const parts: string[] = [];
  const range = f.forecastStart === f.forecastEnd ? dateEn(f.forecastStart) : `from ${dateEn(f.forecastStart)} to ${dateEn(f.forecastEnd)}`;
  parts.push(`For “${f.productName}” I forecast about ${qty(f.forecastTotal, false)} units over ${daysEn(f.horizon)} (${range}), or ${qty(f.forecastAvgPerDay, false)} per day.`);

  if (f.changePercent !== null) {
    const reference = `the last ${daysEn(f.referenceDays)}`;
    const refAvg = qty(f.referenceAvgPerDay, false);
    if (Math.abs(f.changePercent) < 2) {
      parts.push(`That is in line with ${reference} (${refAvg} per day).`);
    } else if (f.changePercent > 0) {
      parts.push(`That is ${pct(f.changePercent, false)}% higher than ${reference} (${refAvg} per day).`);
    } else {
      parts.push(`That is ${pct(f.changePercent, false)}% lower than ${reference} (${refAvg} per day).`);
    }
  }

  if (f.strongestWeekday !== null && f.weakestWeekday !== null && f.strongestWeekdayAvg !== null && f.weakestWeekdayAvg !== null) {
    parts.push(`The strongest day is ${f.strongestWeekday} (about ${qty(f.strongestWeekdayAvg, false)} units) and the weakest is ${f.weakestWeekday} (about ${qty(f.weakestWeekdayAvg, false)}).`);
  }

  if (f.intervalHalfWidthPercent !== null) {
    parts.push(`The confidence interval is about ±${pct(f.intervalHalfWidthPercent, false)}% around the central value: the wider it is, the more uncertain the forecast.`);
  }

  if (f.maeUsed !== null) {
    const check = f.holdoutDays > 0 ? `In the check on the last ${daysEn(f.holdoutDays)}` : "In the check";
    let sentence = `${check}, the chosen method (${methodLabel(f.methodUsed, false)}) was off by ${qty(f.maeUsed, false)} units per day on average`;
    if (f.improvementVsNaivePercent !== null) {
      sentence +=
        f.improvementVsNaivePercent > 0
          ? `, ${pct(f.improvementVsNaivePercent, false)}% less than the simple benchmark method (naive).`
          : ", no better than the simple benchmark method (naive), so treat the forecast with caution.";
    } else {
      sentence += ".";
    }
    parts.push(sentence);
  }

  if (f.filledMissingDays > 0) {
    parts.push(`${daysEn(f.filledMissingDays)} of history were missing and were estimated by interpolation.`);
  }
  if (f.zeroDaysPercent >= INTERMITTENT_THRESHOLD_PERCENT) {
    parts.push(`${pct(f.zeroDaysPercent, false)}% of the days in the history have zero sales: with such an intermittent series the forecast is not very reliable.`);
  }
  return parts.join(" ");
}
