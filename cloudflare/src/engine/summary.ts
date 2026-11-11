import type { ExplanationFacts } from "./explain";
import type { ReorderOutcome } from "./reorder";

/** How much to trust the forecast, in four words instead of error figures. */
export type TrustLevel = "high" | "medium" | "low" | "very_low";

export interface Trust {
  level: TrustLevel;
  /** The average daily error as a share of the forecast average, in percent. Null if the check on the past gave no error. */
  errorPercent: number | null;
  /** The average daily error, in units. */
  errorUnits: number | null;
  /** True: better than repeating last week. False: not better. Null: not known (or last week's repetition was the method used). */
  beatsNaive: boolean | null;
  zeroDaysPercent: number;
  /** Many days with zero sales: the series is hard to predict whatever the method. */
  intermittent: boolean;
}

const SEVERITY: Record<TrustLevel, number> = { high: 0, medium: 1, low: 2, very_low: 3 };
const worse = (a: TrustLevel, b: TrustLevel): TrustLevel => (SEVERITY[a] >= SEVERITY[b] ? a : b);

/** From this share of days with zero sales the series counts as intermittent (the same threshold as the reorder warning). */
const INTERMITTENT_PERCENT = 20;
const VERY_INTERMITTENT_PERCENT = 50;

/**
 * An indicative verdict, not a guarantee. The error of the check on the past is compared with the size of the forecast:
 * under 10% "high", under 20% "medium", under 35% "low", above that "very low". A forecast that does no better than repeating last week,
 * or a series with many days at zero, is never better than "low" (and with half of the days at zero it is "very low").
 */
export function trustVerdict(facts: ExplanationFacts): Trust {
  const errorUnits = facts.maeUsed;
  const errorPercent = errorUnits !== null && facts.forecastAvgPerDay > 0 ? (errorUnits / facts.forecastAvgPerDay) * 100 : null;

  let level: TrustLevel;
  if (errorPercent === null) level = "low"; // nothing to check it against: no promises
  else if (errorPercent < 10) level = "high";
  else if (errorPercent < 20) level = "medium";
  else if (errorPercent < 35) level = "low";
  else level = "very_low";

  const usedNaive = facts.methodUsed.toLowerCase() === "naive";
  const beatsNaive = usedNaive || facts.improvementVsNaivePercent === null ? null : facts.improvementVsNaivePercent > 0;
  if (beatsNaive === false) level = worse(level, "low");

  const intermittent = facts.zeroDaysPercent >= INTERMITTENT_PERCENT;
  if (intermittent) level = worse(level, "low");
  if (facts.zeroDaysPercent >= VERY_INTERMITTENT_PERCENT) level = worse(level, "very_low");

  return { level, errorPercent, errorUnits, beatsNaive, zeroDaysPercent: facts.zeroDaysPercent, intermittent };
}

export interface Summary {
  /** What will be sold. */
  sales: {
    days: number;
    start: string;
    end: string;
    total: number;
    avgPerDay: number;
    referenceDays: number;
    /** Against the same number of days of recent history; null if there is nothing to compare with. */
    changePercent: number | null;
    /** English names of the weekdays ("Saturday"); null when the difference is not significant. */
    strongestWeekday: string | null;
    weakestWeekday: string | null;
  };
  /** How much to order: null if it cannot be worked out (see orderError). */
  order: {
    periodDays: number;
    leadTimeDays: number;
    reviewDays: number;
    serviceLevelPercent: number;
    demandInPeriod: number;
    safetyStock: number;
    orderUpToLevel: number;
    onHand: number | null;
    suggestedOrder: number | null;
  } | null;
  orderError: string | null;
  trust: Trust;
}

/** The three answers a person wants: how much will I sell, how much do I order, how much can I trust it. */
export function buildSummary(facts: ExplanationFacts, reorder: ReorderOutcome): Summary {
  const order = reorder.ok
    ? {
        periodDays: reorder.suggestion.periodDays,
        leadTimeDays: reorder.suggestion.leadTimeDays,
        reviewDays: reorder.suggestion.reviewDays,
        serviceLevelPercent: reorder.suggestion.serviceLevelPercent,
        demandInPeriod: reorder.suggestion.demandInPeriod,
        safetyStock: reorder.suggestion.safetyStock,
        orderUpToLevel: reorder.suggestion.orderUpToLevel,
        onHand: reorder.suggestion.onHand,
        suggestedOrder: reorder.suggestion.suggestedOrder,
      }
    : null;
  return {
    sales: {
      days: facts.horizon,
      start: facts.forecastStart,
      end: facts.forecastEnd,
      total: facts.forecastTotal,
      avgPerDay: facts.forecastAvgPerDay,
      referenceDays: facts.referenceDays,
      changePercent: facts.changePercent,
      strongestWeekday: facts.strongestWeekday,
      weakestWeekday: facts.weakestWeekday,
    },
    order,
    orderError: reorder.ok ? null : reorder.error,
    trust: trustVerdict(facts),
  };
}
