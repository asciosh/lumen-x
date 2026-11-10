import { dayNumber, isoFromDayNumber, toIso } from "../dates";
import { tokens } from "./question";

export type PeriodKind = "none" | "last_days" | "calendar_month";

/** The period named in the question: "last N days" or a calendar month (with an optional year). */
export interface PeriodSpec {
  kind: PeriodKind;
  days: number;
  year: number;
  month: number;
}

/** The period resolved to real dates, relative to the last day of data and not to today's date. */
export interface PeriodRange {
  start: string;
  end: string;
  kind: PeriodKind;
  year: number;
  month: number;
}

const MAX_DAYS = 3650;

const LAST_PERIOD = /\b(?:ultim[oiae]|last|past)\s+(?:(\d{1,3})\s+|([a-z]+)\s+)?(giorn[oi]|settiman[ae]|mes[ei]|ann[oi]|days?|weeks?|months?|years?)\b/;
const FUTURE_PERIOD = /\b(?:prossim[oiae]|next|coming|upcoming)\s+(?:(\d{1,3})\s+|([a-z]+)\s+)?(giorn[oi]|settiman[ae]|mes[ei]|days?|weeks?|months?)\b/;
const YEAR_TOKEN = /\b(20\d{2})\b/;

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, one: 1, due: 2, two: 2, tre: 3, three: 3, quattro: 4, four: 4, cinque: 5, five: 5, sei: 6, six: 6,
  sette: 7, seven: 7, otto: 8, eight: 8, nove: 9, nine: 9, dieci: 10, ten: 10, undici: 11, eleven: 11, dodici: 12, twelve: 12,
};

const MONTH_NAMES: Record<string, number> = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** The months named, in order of appearance and without repetitions. */
export function monthsMentioned(normalized: string): number[] {
  const months: number[] = [];
  for (const token of tokens(normalized)) {
    const month = Object.hasOwn(MONTH_NAMES, token) ? MONTH_NAMES[token]! : undefined;
    if (month !== undefined && !months.includes(month)) months.push(month);
  }
  return months;
}

const isPlural = (unit: string) => ["giorni", "settimane", "mesi", "anni", "days", "weeks", "months", "years"].includes(unit);

function unitDays(unit: string): number {
  if (unit.startsWith("settiman") || unit.startsWith("week")) return 7;
  if (unit.startsWith("mes") || unit.startsWith("month")) return 30;
  if (unit.startsWith("ann") || unit.startsWith("year")) return 365;
  return 1;
}

// Regex groups: 1 = number in digits, 2 = word (maybe a number written in letters), 3 = unit.
function tryDays(match: RegExpExecArray): number | null {
  const digits = match[1] ?? "";
  const word = match[2] ?? "";
  const unit = match[3] ?? "";
  let count: number;
  if (digits.length > 0) {
    count = Number.parseInt(digits, 10);
  } else if (word.length > 0 && Object.hasOwn(NUMBER_WORDS, word)) {
    count = NUMBER_WORDS[word]!;
  } else if (isPlural(unit)) {
    return null; // "last days" without a number: unknown how many
  } else {
    count = 1; // "ultimo mese", "last week"
  }
  if (count < 1) return null;
  return Math.min(count * unitDays(unit), MAX_DAYS);
}

/** The past period: "last N days/weeks/months" or a calendar month. */
export function parseLast(normalized: string): PeriodSpec {
  const match = LAST_PERIOD.exec(normalized);
  if (match !== null) {
    const days = tryDays(match);
    if (days !== null) return { kind: "last_days", days, year: 0, month: 0 };
  }
  const months = monthsMentioned(normalized);
  if (months.length > 0) {
    const yearMatch = YEAR_TOKEN.exec(normalized);
    return { kind: "calendar_month", days: 0, year: yearMatch !== null ? Number.parseInt(yearMatch[1]!, 10) : 0, month: months[0]! };
  }
  return { kind: "none", days: 0, year: 0, month: 0 };
}

/** How many days into the future: "next 2 weeks" is 14. Null if the question does not say. */
export function parseFutureDays(normalized: string): number | null {
  const match = FUTURE_PERIOD.exec(normalized);
  return match === null ? null : tryDays(match);
}

export const addDays = (iso: string, n: number): string => isoFromDayNumber(dayNumber(iso) + n);

export function resolve(spec: PeriodSpec, lastDay: string, defaultDays: number): PeriodRange {
  switch (spec.kind) {
    case "calendar_month": {
      let year = spec.year !== 0 ? spec.year : Number(lastDay.slice(0, 4));
      if (spec.year === 0 && toIso(year, spec.month, 1) > lastDay) year--;
      const daysInMonth = new Date(Date.UTC(year, spec.month, 0)).getUTCDate();
      return { start: toIso(year, spec.month, 1), end: toIso(year, spec.month, daysInMonth), kind: "calendar_month", year, month: spec.month };
    }
    case "last_days":
      return { start: addDays(lastDay, -(spec.days - 1)), end: lastDay, kind: "last_days", year: 0, month: 0 };
    default:
      return { start: addDays(lastDay, -(defaultDays - 1)), end: lastDay, kind: "none", year: 0, month: 0 };
  }
}
