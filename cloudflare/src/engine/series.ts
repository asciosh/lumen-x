import { dayNumber, isoFromDayNumber } from "./dates";
import { SeriesError, type SalePoint } from "./types";

export interface PreparedSeries {
  /** Daily values, one per day from `startDay` to the last day, with the gaps filled in. */
  values: number[];
  /** Day number (days since 1970-01-01) of the first value. */
  startDay: number;
  /** How many days were missing and had to be filled in. */
  filled: number;
  /** ISO date of the last value. */
  lastDate: string;
}

/**
 * Sorts the points, rejects duplicates and non-finite values, and fills the missing days by linear
 * interpolation. A series with more than 20% of missing days is rejected: it would be mostly invented.
 */
export function prepareSeries(points: readonly SalePoint[]): PreparedSeries {
  if (points.length === 0) {
    throw new SeriesError("The series is empty.");
  }

  const byDay = new Map<number, number>();
  for (const p of points) {
    if (!Number.isFinite(p.quantity)) {
      throw new SeriesError("The series contains values that are not numbers.");
    }
    const day = dayNumber(p.date);
    if (byDay.has(day)) {
      throw new SeriesError("The series has duplicate dates.");
    }
    byDay.set(day, p.quantity);
  }

  const days = [...byDay.keys()].sort((a, b) => a - b);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const length = last - first + 1;

  const values = new Array<number>(length);
  const known: number[] = [];
  for (let i = 0; i < length; i++) {
    const v = byDay.get(first + i);
    if (v === undefined) {
      values[i] = Number.NaN;
    } else {
      values[i] = v;
      known.push(i);
    }
  }

  const filled = length - known.length;
  if (filled > 0.2 * length) {
    throw new SeriesError(`Too many missing days (${filled} of ${length}).`);
  }

  // Linear interpolation between the neighbouring known days (the first and the last day always exist).
  let k = 0;
  for (let i = 0; i < length; i++) {
    if (!Number.isNaN(values[i]!)) {
      continue;
    }
    while (known[k + 1]! < i) {
      k++;
    }
    const a = known[k]!;
    const b = known[k + 1]!;
    values[i] = values[a]! + ((values[b]! - values[a]!) * (i - a)) / (b - a);
  }

  return { values, startDay: first, filled, lastDate: isoFromDayNumber(last) };
}
