import { dateEn, dateIt, daysEn, daysIt, buildFacts, explain, pct, qty, weekdayIndex, type RunForFacts } from "../explain";
import { dayNumber } from "../dates";
import { INTERMITTENT_THRESHOLD_PERCENT, calculateReorder } from "../reorder";
import type { SalePoint } from "../types";
import { classify, type DataIntent } from "./intent";
import { addDays, monthsMentioned, parseFutureDays, parseLast, resolve, type PeriodRange } from "./period";
import { normalize, tokens } from "./question";

/**
 * Answers questions about the data (a port of DataQuestionAnswerer.cs). No AI and no invented numbers: the question is mapped to
 * one of those the code knows how to solve; the answer is computed from the data and written with fixed phrases.
 * Periods always refer to the last day of data, not to today's date.
 */

/** Everything needed to answer: the history, the latest forecast (if any) and the share of zero-sales days. */
export interface AskContext {
  productName: string;
  sales: readonly SalePoint[];
  forecast: RunForFacts | null;
  zeroDaysPercent: number;
}

export interface AskAnswer {
  intent: DataIntent;
  text: string;
  understood: boolean;
  suggestions: readonly string[];
}

const DEFAULT_SALES_DAYS = 30;
const DEFAULT_PEAK_DAYS = 90;
const DEFAULT_COMPARE_DAYS = 28;
const WEEKDAY_WINDOW_DAYS = 84;
const MIN_WEEKDAY_DAYS = 14;

// Words about money: the system only has quantities, not prices.
const MONEY_STEMS = ["incass", "fattur", "ricav", "guadagn", "soldi", "euro", "revenue", "income", "earn", "profit", "money"];

const ITALIAN_EXAMPLES = [
  "Quanto ho venduto negli ultimi 30 giorni?",
  "Come vanno le vendite rispetto al mese scorso?",
  "Qual è il giorno più forte della settimana?",
  "Quanto prevedo di vendere nelle prossime 2 settimane?",
  "Cosa conviene ordinare?",
  "Quanto è affidabile la previsione?",
  "Spiegami la previsione",
  "Qual è stato il giorno record?",
];
const ENGLISH_EXAMPLES = [
  "How much did I sell in the last 30 days?",
  "How are sales doing compared to last month?",
  "Which day of the week sells best?",
  "How much will I sell in the next 2 weeks?",
  "What should I order?",
  "How reliable is the forecast?",
  "Explain the forecast",
  "What was my record day?",
];

/** Example questions the system is sure to understand. */
export const examples = (language: string): readonly string[] => (language === "en" ? ENGLISH_EXAMPLES : ITALIAN_EXAMPLES);

const IT_WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const IT_MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const D = (iso: string, it: boolean): string => (it ? dateIt(iso) : dateEn(iso));
const days = (n: number, it: boolean): string => (it ? daysIt(n) : daysEn(n));
const weekday = (index: number, it: boolean): string => (it ? IT_WEEKDAYS : EN_WEEKDAYS)[index]!;
const month = (m: number, it: boolean): string => (it ? IT_MONTHS : EN_MONTHS)[m - 1]!;
const byDate = (a: { date: string }, b: { date: string }) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function answer(question: string, language: string, context: AskContext): AskAnswer {
  const it = language !== "en";
  const normalized = normalize(question);
  const { intent } = classify(normalized);

  if (intent === "unknown") {
    return { intent, text: unknownText(it), understood: false, suggestions: examples(language) };
  }

  const sales = [...context.sales].sort(byDate);
  if (sales.length === 0) {
    const empty = it
      ? "Non ci sono ancora vendite per questo prodotto: importa un CSV e poi chiedimi pure."
      : "There are no sales for this product yet: import a CSV and then ask away.";
    return { intent, text: empty, understood: true, suggestions: [] };
  }

  let text: string;
  switch (intent) {
    case "sales_total": text = salesTotal(normalized, sales, it); break;
    case "compare_periods": text = comparePeriods(normalized, sales, it); break;
    case "weekday_pattern": text = weekdayPattern(sales, it); break;
    case "peak_day": text = peakDay(normalized, sales, it); break;
    case "forecast_total": text = forecastTotal(normalized, context, it); break;
    case "reorder": text = reorderText(context, it); break;
    case "reliability": text = reliabilityText(sales, context, it); break;
    case "summary": text = summaryText(sales, context, language); break;
    default: text = unknownText(it);
  }

  if (asksAboutMoney(normalized) && intent !== "summary" && intent !== "reliability") {
    text = moneyNote(it) + text;
  }
  return { intent, text, understood: true, suggestions: [] };
}

const asksAboutMoney = (normalized: string): boolean => tokens(normalized).some((t) => MONEY_STEMS.some((stem) => t.startsWith(stem)));

const moneyNote = (it: boolean): string =>
  it
    ? "Non conosco i prezzi, quindi non posso parlare di incassi: ti rispondo con le unità vendute. "
    : "I do not have prices, so I cannot talk about revenue: here are the units sold. ";

// ------------------------------------------------------------------ sales

function noSalesInRange(range: PeriodRange, first: string, last: string, it: boolean): string {
  return it
    ? `Non ho vendite tra il ${D(range.start, it)} e il ${D(range.end, it)}: i dati vanno dal ${D(first, it)} al ${D(last, it)}.`
    : `I have no sales between ${D(range.start, it)} and ${D(range.end, it)}: the data goes from ${D(first, it)} to ${D(last, it)}.`;
}

function salesTotal(normalized: string, sales: SalePoint[], it: boolean): string {
  const first = sales[0]!.date;
  const last = sales[sales.length - 1]!.date;
  const range = resolve(parseLast(normalized), last, DEFAULT_SALES_DAYS);
  const inRange = sales.filter((s) => s.date >= range.start && s.date <= range.end);
  if (inRange.length === 0) return noSalesInRange(range, first, last, it);

  const total = inRange.reduce((s, p) => s + p.quantity, 0);
  const average = total / inRange.length;
  const label = periodLabel(range, inRange, it);
  const n = days(inRange.length, it);
  let text = it
    ? `${label} (${n}) hai venduto ${qty(total, it)} unità, cioè ${qty(average, it)} al giorno.`
    : `${label} (${n}) you sold ${qty(total, it)} units, or ${qty(average, it)} per day.`;
  if (range.start < first || range.end > last) {
    text += it ? ` I dati disponibili vanno dal ${D(first, it)} al ${D(last, it)}.` : ` The available data goes from ${D(first, it)} to ${D(last, it)}.`;
  }
  return text;
}

function comparePeriods(normalized: string, sales: SalePoint[], it: boolean): string {
  if (monthsMentioned(normalized).length >= 2) {
    return it
      ? "Il confronto tra due mesi nominati non è ancora supportato: prova «Come vanno le vendite rispetto al mese scorso?»."
      : 'Comparing two named months is not supported yet: try "How are sales doing compared to last month?".';
  }

  const first = sales[0]!.date;
  const last = sales[sales.length - 1]!.date;
  const spec = parseLast(normalized);
  let window: number;
  if (spec.kind === "last_days") window = spec.days;
  else if (normalized.includes("settiman") || normalized.includes("week")) window = 7;
  else if (normalized.includes("mese") || normalized.includes("mesi") || normalized.includes("month")) window = 30;
  else window = DEFAULT_COMPARE_DAYS;

  const span = dayNumber(last) - dayNumber(first) + 1;
  if (span < 2 * window) {
    return it
      ? `Per confrontare due periodi da ${days(window, it)} servono almeno ${days(2 * window, it)} di storico: ne ho ${days(span, it)}.`
      : `To compare two periods of ${days(window, it)} I need at least ${days(2 * window, it)} of history: I have ${days(span, it)}.`;
  }

  const currentStart = addDays(last, -(window - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(window - 1));
  const current = sales.filter((s) => s.date >= currentStart);
  const previous = sales.filter((s) => s.date >= previousStart && s.date <= previousEnd);
  const currentTotal = current.reduce((s, p) => s + p.quantity, 0);
  const previousTotal = previous.reduce((s, p) => s + p.quantity, 0);

  const n = days(window, it);
  const head = it
    ? `Negli ultimi ${n} (dal ${D(currentStart, it)} al ${D(last, it)}) hai venduto ${qty(currentTotal, it)} unità`
    : `In the last ${n} (from ${D(currentStart, it)} to ${D(last, it)}) you sold ${qty(currentTotal, it)} units`;

  let tail: string;
  if (previousTotal <= 0) {
    tail = it ? "; nel periodo precedente non risultano vendite." : "; there are no sales in the previous period.";
  } else {
    const change = ((currentTotal - previousTotal) / previousTotal) * 100;
    if (Math.abs(change) < 2) {
      tail = it
        ? `, contro ${qty(previousTotal, it)} nei ${n} precedenti: praticamente invariato (meno del 2% di differenza).`
        : `, against ${qty(previousTotal, it)} in the previous ${n}: practically unchanged (less than 2% difference).`;
    } else {
      tail = it
        ? `, contro ${qty(previousTotal, it)} nei ${n} precedenti: il ${pct(change, it)}% in ${change > 0 ? "più" : "meno"}.`
        : `, against ${qty(previousTotal, it)} in the previous ${n}: ${pct(change, it)}% ${change > 0 ? "more" : "less"}.`;
    }
  }

  const note =
    current.length !== window || previous.length !== window
      ? it ? ` Giorni con dati: ${current.length} e ${previous.length}.` : ` Days with data: ${current.length} and ${previous.length}.`
      : "";
  return head + tail + note;
}

function weekdayPattern(sales: SalePoint[], it: boolean): string {
  const last = sales[sales.length - 1]!.date;
  const from = addDays(last, -(WEEKDAY_WINDOW_DAYS - 1));
  const window = sales.filter((s) => s.date >= from);
  if (window.length < MIN_WEEKDAY_DAYS) {
    return it
      ? `Servono almeno ${days(MIN_WEEKDAY_DAYS, it)} di vendite per capire quali giorni della settimana vanno meglio.`
      : `I need at least ${days(MIN_WEEKDAY_DAYS, it)} of sales to tell which weekdays do best.`;
  }

  const sums = new Map<number, { sum: number; n: number }>();
  for (const s of window) {
    const day = weekdayIndex(s.date);
    const entry = sums.get(day) ?? { sum: 0, n: 0 };
    entry.sum += s.quantity;
    entry.n += 1;
    sums.set(day, entry);
  }
  const byDay = [...sums.entries()].map(([day, e]) => ({ day, average: e.sum / e.n }));
  const top = [...byDay].sort((a, b) => b.average - a.average || a.day - b.day)[0]!;
  const bottom = [...byDay].sort((a, b) => a.average - b.average || a.day - b.day)[0]!;
  const overall = window.reduce((s, p) => s + p.quantity, 0) / window.length;
  const n = days(window.length, it);

  if (top.day === bottom.day || (top.average - bottom.average) / Math.max(overall, 0.000001) < 0.05) {
    return it
      ? `Guardando gli ultimi ${n} di dati, le vendite sono molto regolari durante la settimana: nessun giorno si distingue davvero.`
      : `Looking at the last ${n} of data, sales are very even across the week: no day really stands out.`;
  }
  return it
    ? `Guardando gli ultimi ${n} di dati, il giorno più forte è ${weekday(top.day, it)} (in media ${qty(top.average, it)} unità) e il più debole ${weekday(bottom.day, it)} (${qty(bottom.average, it)}).`
    : `Looking at the last ${n} of data, the strongest day is ${weekday(top.day, it)} (about ${qty(top.average, it)} units on average) and the weakest is ${weekday(bottom.day, it)} (${qty(bottom.average, it)}).`;
}

function peakDay(normalized: string, sales: SalePoint[], it: boolean): string {
  const first = sales[0]!.date;
  const last = sales[sales.length - 1]!.date;
  const range = resolve(parseLast(normalized), last, DEFAULT_PEAK_DAYS);
  const inRange = sales.filter((s) => s.date >= range.start && s.date <= range.end);
  if (inRange.length === 0) return noSalesInRange(range, first, last, it);

  // The first day wins a tie (the history is sorted by date).
  let best = inRange[0]!;
  let worst = inRange[0]!;
  for (const s of inRange) {
    if (s.quantity > best.quantity) best = s;
    if (s.quantity < worst.quantity) worst = s;
  }
  const fromText = D(inRange[0]!.date, it);
  const toText = D(inRange[inRange.length - 1]!.date, it);
  return it
    ? `Dal ${fromText} al ${toText} il giorno migliore è stato ${D(best.date, it)} (${weekday(weekdayIndex(best.date), it)}) con ${qty(best.quantity, it)} unità; il peggiore ${D(worst.date, it)} (${weekday(weekdayIndex(worst.date), it)}) con ${qty(worst.quantity, it)}.`
    : `From ${fromText} to ${toText} the best day was ${D(best.date, it)} (${weekday(weekdayIndex(best.date), it)}) with ${qty(best.quantity, it)} units; the worst was ${D(worst.date, it)} (${weekday(weekdayIndex(worst.date), it)}) with ${qty(worst.quantity, it)}.`;
}

// ------------------------------------------------------------------ forecast

function forecastTotal(normalized: string, context: AskContext, it: boolean): string {
  const forecast = context.forecast;
  if (forecast === null || forecast.forecast.length === 0) return noForecast(it);

  const points = [...forecast.forecast].sort(byDate);
  const requested = parseFutureDays(normalized);
  const count = requested !== null ? Math.min(requested, points.length) : points.length;
  const used = points.slice(0, count);
  const total = used.reduce((s, p) => s + p.yhat, 0);
  const average = total / used.length;
  const n = days(used.length, it);

  let text = it
    ? `Per i prossimi ${n} (dal ${D(used[0]!.date, it)} al ${D(used[used.length - 1]!.date, it)}) prevedo circa ${qty(total, it)} unità, ${qty(average, it)} al giorno.`
    : `For the next ${n} (from ${D(used[0]!.date, it)} to ${D(used[used.length - 1]!.date, it)}) I forecast about ${qty(total, it)} units, ${qty(average, it)} per day.`;
  if (requested !== null && requested > points.length) {
    const covered = days(points.length, it);
    text += it
      ? ` Il forecast copre solo ${covered}: per andare oltre ricalcolalo con un orizzonte più lungo.`
      : ` The forecast only covers ${covered}: recompute it with a longer horizon to go further.`;
  }
  return text + zeroWarning(context, it);
}

function reorderText(context: AskContext, it: boolean): string {
  const forecast = context.forecast;
  if (forecast === null || forecast.forecast.length === 0) return noForecast(it);

  const outcome = calculateReorder(forecast, 7, 7, 95, null, context.zeroDaysPercent);
  if (!outcome.ok) {
    return it
      ? "Il forecast è troppo corto per coprire il periodo di riordino: ricalcolalo con un orizzonte più lungo (almeno 14 giorni)."
      : "The forecast is too short to cover the reorder period: recompute it with a longer horizon (at least 14 days).";
  }
  const s = outcome.suggestion;
  const text = it
    ? `Per coprire i prossimi ${s.periodDays} giorni (${s.leadTimeDays} di consegna e ${s.reviewDays} tra un ordine e l'altro) con un livello di servizio del ${s.serviceLevelPercent}%: domanda prevista ${qty(s.demandInPeriod, it)}, scorta di sicurezza ${qty(s.safetyStock, it)}, quindi serve un livello massimo di circa ${qty(s.orderUpToLevel, it)} unità tra magazzino e ordini. Nel riquadro Riordino puoi indicare i tuoi tempi e la scorta attuale.`
    : `To cover the next ${s.periodDays} days (${s.leadTimeDays} of delivery and ${s.reviewDays} between orders) at a ${s.serviceLevelPercent}% service level: expected demand ${qty(s.demandInPeriod, it)}, safety stock ${qty(s.safetyStock, it)}, so you need a maximum level of about ${qty(s.orderUpToLevel, it)} units between stock and orders. In the Reorder box you can enter your own lead times and current stock.`;
  return text + zeroWarning(context, it);
}

const methodLabel = (method: string, it: boolean): string =>
  method === "blend" ? (it ? "la media di ETS e LightGBM" : "the average of ETS and LightGBM") : method;

function reliabilityText(sales: SalePoint[], context: AskContext, it: boolean): string {
  const forecast = context.forecast;
  if (forecast === null || forecast.forecast.length === 0) return noForecast(it);

  const facts = buildFacts(context.productName, sales, forecast);
  const method = methodLabel(facts.methodUsed, it);
  const parts: string[] = [it ? `Il metodo usato è ${method}.` : `The method used is ${method}.`];

  if (facts.maeUsed !== null) {
    const share = facts.forecastAvgPerDay > 0 ? (facts.maeUsed / facts.forecastAvgPerDay) * 100 : null;
    const shareText = share !== null ? (it ? `, circa il ${pct(share, it)}% delle vendite previste` : `, about ${pct(share, it)}% of the forecast sales`) : "";
    parts.push(
      it
        ? `Nei giorni di verifica ha sbagliato in media di ${qty(facts.maeUsed, it)} unità al giorno${shareText}.`
        : `On the check days it was off by ${qty(facts.maeUsed, it)} units per day on average${shareText}.`,
    );
  }
  if (facts.intervalHalfWidthPercent !== null) {
    parts.push(it ? `La fascia probabile è di circa ±${pct(facts.intervalHalfWidthPercent, it)}%.` : `The likely range is about ±${pct(facts.intervalHalfWidthPercent, it)}%.`);
  }
  if (facts.improvementVsNaivePercent !== null) {
    if (facts.improvementVsNaivePercent > 0) {
      parts.push(
        it
          ? `È il ${pct(facts.improvementVsNaivePercent, it)}% in meno del metodo semplice di confronto (naive).`
          : `That is ${pct(facts.improvementVsNaivePercent, it)}% less than the simple benchmark method (naive).`,
      );
    } else {
      parts.push(
        it
          ? "Non fa meglio del metodo semplice di confronto (naive): usa la previsione con cautela."
          : "It does no better than the simple benchmark method (naive): treat the forecast with caution.",
      );
    }
  }
  return parts.join(" ") + zeroWarning(context, it);
}

function summaryText(sales: SalePoint[], context: AskContext, language: string): string {
  const forecast = context.forecast;
  if (forecast === null || forecast.forecast.length === 0) return noForecast(language !== "en");
  return explain(buildFacts(context.productName, sales, forecast), language);
}

// ------------------------------------------------------------------ shared texts

const unknownText = (it: boolean): string =>
  it
    ? "Non ho capito la domanda. Posso rispondere su: vendite in un periodo, confronto con il periodo precedente, giorno più forte della settimana, giorno migliore e peggiore, previsione dei prossimi giorni, quanto ordinare e affidabilità della previsione. Per esempio: «Quanto ho venduto negli ultimi 30 giorni?»"
    : 'I did not understand the question. I can answer about: sales in a period, comparison with the previous period, strongest day of the week, best and worst day, forecast for the coming days, how much to order and how reliable the forecast is. For example: "How much did I sell in the last 30 days?"';

const noForecast = (it: boolean): string =>
  it
    ? "Per questo prodotto non c'è ancora un forecast: calcolalo nella sezione Previsione e poi chiedimi pure."
    : "There is no forecast for this product yet: compute it in the Forecast section and then ask away.";

function zeroWarning(context: AskContext, it: boolean): string {
  if (context.zeroDaysPercent < INTERMITTENT_THRESHOLD_PERCENT) return "";
  return it
    ? " Attenzione: molti giorni a zero nello storico, quindi la previsione è poco affidabile."
    : " Careful: many days with zero sales in the history, so the forecast is not very reliable.";
}

function periodLabel(range: PeriodRange, inRange: SalePoint[], it: boolean): string {
  if (range.kind === "calendar_month") {
    const name = month(range.month, it);
    return it ? `A ${name} ${range.year}` : `In ${name} ${range.year}`;
  }
  const fromText = D(inRange[0]!.date, it);
  const toText = D(inRange[inRange.length - 1]!.date, it);
  return it ? `Dal ${fromText} al ${toText}` : `From ${fromText} to ${toText}`;
}
