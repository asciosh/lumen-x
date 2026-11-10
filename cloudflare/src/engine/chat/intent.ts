import { tokens } from "./question";

/** The questions the code knows how to solve, with the stable code the API returns. Everything else is "unknown". */
export type DataIntent =
  | "unknown" | "sales_total" | "compare_periods" | "weekday_pattern" | "peak_day" | "forecast_total" | "reorder" | "reliability" | "summary";

type Cue = readonly [cue: string, weight: number];

/**
 * Recognizes which of the questions the code can solve the user is asking, without AI (a port of IntentClassifier.cs).
 * Each intent has a list of "cues" (word stems or phrases) with a weight; the score is the sum of the weights found; the highest
 * score wins and, on a tie, the intent that comes first in the list (more specific questions come before generic ones).
 * With no cue the question is "unknown": better to say "I did not understand" than to guess.
 */
// ORDER matters: it is the priority on a tie.
const RULES: ReadonlyArray<readonly [DataIntent, readonly Cue[]]> = [
  ["reorder", [["ordin", 6], ["riordin", 6], ["rifornir", 3], ["scort", 1], ["magazzin", 1], ["order", 6], ["reorder", 2], ["restock", 3], ["stock", 1], ["inventor", 1]]],
  ["reliability", [["affidabil", 6], ["reliab", 6], ["precis", 2], ["accura", 2], ["fidar", 2], ["error", 2], ["incertez", 2], ["uncertain", 2], ["trust", 2], ["confiden", 2], ["sbagli", 2]]],
  ["summary", [["spieg", 6], ["explain", 6], ["riassum", 6], ["summar", 6], ["sintesi", 6], ["panoramica", 6], ["overview", 6], ["raccont", 2], ["tell me about", 6]]],
  ["forecast_total", [["prevedo", 3], ["prevedi", 3], ["previsi", 2], ["prossim", 3], ["futur", 2], ["vendero", 3], ["venderemo", 3], ["aspett", 2], ["stima", 2], ["forecast", 3], ["predict", 3], ["expect", 2], ["next", 3], ["will", 1], ["upcoming", 3], ["coming", 2], ["future", 2]]],
  ["compare_periods", [["rispetto", 3], ["confront", 3], ["compar", 3], ["versus", 3], ["vs", 3], ["andament", 2], ["andando", 2], ["trend", 2], ["cresc", 2], ["calo", 2], ["cala", 2], ["aument", 2], ["diminu", 2], ["scors", 1], ["precedent", 2], ["previous", 2], ["grow", 2], ["drop", 2], ["change", 1], ["vanno", 2], ["variaz", 2]]],
  ["weekday_pattern", [["della settimana", 3], ["of the week", 3], ["quale giorno", 3], ["che giorno", 3], ["which day", 3], ["what day", 3], ["weekday", 3], ["settimanal", 2], ["piu forte", 2], ["piu debole", 2], ["strongest", 2], ["weakest", 2], ["luned", 3], ["marted", 3], ["mercoled", 3], ["gioved", 3], ["venerd", 3], ["sabat", 3], ["domenic", 3], ["monday", 3], ["tuesday", 3], ["wednesday", 3], ["thursday", 3], ["friday", 3], ["saturday", 3], ["sunday", 3]]],
  ["peak_day", [["record", 3], ["picco", 3], ["massimo", 2], ["minimo", 2], ["giorno migliore", 3], ["miglior giorno", 3], ["giorno peggiore", 3], ["peggior giorno", 3], ["best day", 3], ["worst day", 3], ["peak", 3], ["highest", 2], ["lowest", 2], ["maximum", 2], ["minimum", 2]]],
  ["sales_total", [["vendut", 3], ["vend", 1], ["sold", 3], ["sell", 2], ["sales", 1], ["units", 1], ["unita", 1], ["incass", 2], ["fattur", 2], ["ricav", 2], ["guadagn", 2], ["revenue", 2], ["income", 2], ["earn", 2], ["profit", 2], ["total", 1], ["media", 1], ["average", 1]]],
];

function score(normalized: string, words: readonly string[], cues: readonly Cue[]): number {
  const padded = ` ${normalized} `;
  let total = 0;
  for (const [cue, weight] of cues) {
    // A whole phrase must appear as is; a single word is a stem: it is enough that a token starts with it.
    const hit = cue.includes(" ") ? padded.includes(` ${cue} `) : words.some((t) => t.startsWith(cue));
    if (hit) total += weight;
  }
  return total;
}

export function classify(normalized: string): { intent: DataIntent; score: number } {
  const words = tokens(normalized);
  let best: DataIntent = "unknown";
  let bestScore = 0;
  for (const [intent, cues] of RULES) {
    const s = score(normalized, words, cues);
    if (s > bestScore) {
      best = intent;
      bestScore = s;
    }
  }
  return { intent: best, score: bestScore };
}
