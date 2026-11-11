import type { ExplanationFacts } from "./explain";

/**
 * Checks that the numbers written by an AI appear among the facts computed by the code (a port of NumberGuard.cs).
 * A text with figures that are not in the facts must be discarded by the caller.
 *
 * Limits: it is a cautious check, not a proof. It accepts roundings (within 1% or the last written digit) and the digits of dates and
 * product name, so it may let through an invented figure that happens to coincide with one of these, and it may discard correct texts
 * that use unexpected formats (for example a space as thousands separator).
 */
const NUMBER_TOKEN = /\d+(?:[.,]\d+)*/g;

/** The numbers in the text that match no fact (without duplicates). */
export function findUnsupportedNumbers(text: string, facts: ExplanationFacts, language: string): string[] {
  const allowed = allowedValues(facts);
  const unsupported: string[] = [];
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const token = match[0];
    const parsed = tryParse(token, language);
    const ok = parsed !== null && isAllowed(parsed.value, parsed.decimals, allowed);
    if (!ok && !unsupported.includes(token)) unsupported.push(token);
  }
  return unsupported;
}

function allowedValues(f: ExplanationFacts): number[] {
  const values = [f.historyDays, f.horizon, f.referenceDays, f.holdoutDays, f.filledMissingDays, f.forecastTotal, f.forecastAvgPerDay, f.referenceAvgPerDay, f.zeroDaysPercent];
  // Changes and differences may be written without sign ("4% more").
  for (const v of [f.changePercent, f.strongestWeekdayAvg, f.weakestWeekdayAvg, f.intervalHalfWidthPercent, f.maeUsed, f.maeNaive, f.improvementVsNaivePercent]) {
    if (v !== null) values.push(Math.abs(v));
  }
  // Day, month and year of the dates: the AI writes them in full ("16 May 2026").
  for (const iso of [f.historyEnd, f.forecastStart, f.forecastEnd]) {
    values.push(Number(iso.slice(8, 10)), Number(iso.slice(5, 7)), Number(iso.slice(0, 4)));
  }
  // Digits in the product name ("Bread 2024") are legitimate.
  for (const m of f.productName.matchAll(/\d+/g)) values.push(Number(m[0]));
  return values;
}

/** Reads a number with the separators of the requested language (it: 3.360,5 - en: 3,360.5). */
function tryParse(token: string, language: string): { value: number; decimals: number } | null {
  const decimalSeparator = language === "en" ? "." : ",";
  const groupSeparator = language === "en" ? "," : ".";
  let integerPart = token;
  let fraction = "";
  let decimals = 0;
  const lastDecimal = token.lastIndexOf(decimalSeparator);
  if (lastDecimal >= 0) {
    if (token.indexOf(decimalSeparator) !== lastDecimal) return null; // more than one decimal separator: invalid format
    integerPart = token.slice(0, lastDecimal);
    fraction = token.slice(lastDecimal + 1);
    decimals = fraction.length;
  }
  integerPart = integerPart.split(groupSeparator).join("");
  const value = Number(fraction.length > 0 ? `${integerPart}.${fraction}` : integerPart);
  return Number.isFinite(value) ? { value, decimals } : null;
}

function isAllowed(value: number, decimals: number, allowed: readonly number[]): boolean {
  const roundingTolerance = 0.5 * Math.pow(10, -decimals);
  return allowed.some((a) => Math.abs(value - a) <= Math.max(roundingTolerance, 0.01 * Math.abs(a)) + 1e-9);
}
