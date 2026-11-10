/** Cleaning of the question text and language detection (a port of QuestionText.cs). */

// Accents removed by hand: it does not depend on the Unicode tables of the machine.
const FOLDS: Record<string, string> = {
  à: "a", á: "a", â: "a", ä: "a",
  è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i",
  ò: "o", ó: "o", ô: "o", ö: "o",
  ù: "u", ú: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

// Words that appear (almost) only in one of the two languages.
const ITALIAN_MARKERS = new Set([
  "quanto", "quanti", "ho", "venduto", "vendite", "ultimi", "ultimo", "ultime", "giorni", "giorno", "settimana",
  "settimane", "mese", "mesi", "previsione", "previsioni", "qual", "quale", "migliore", "ordinare", "prossimi",
  "prossime", "rispetto", "affidabile", "spiega", "spiegami", "unita", "il", "lo", "la", "le", "gli", "di", "del",
  "della", "che", "come", "sono", "nel", "nella", "per", "un", "una", "cosa", "conviene", "vanno", "mio", "mia",
]);
const ENGLISH_MARKERS = new Set([
  "the", "how", "much", "many", "did", "sold", "sell", "last", "days", "day", "week", "weeks", "month", "months",
  "forecast", "what", "which", "best", "worst", "order", "next", "compared", "reliable", "explain", "units", "my",
  "was", "are", "is", "of", "to", "for", "with", "than",
]);

/** Lowercase, no accents, only letters and digits separated by a space ("l'ultimo" becomes "l ultimo"). */
export function normalize(text: string): string {
  let out = "";
  for (const raw of text.trim().toLowerCase()) {
    const c = FOLDS[raw] ?? raw;
    out += /[\p{L}\p{Nd}]/u.test(c) ? c : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

export const tokens = (normalized: string): string[] => normalized.split(" ").filter((t) => t.length > 0);

/** "it" or "en": the language with more recognized words wins; on a tie, Italian. */
export function detectLanguage(normalized: string): "it" | "en" {
  const words = tokens(normalized);
  const english = words.filter((t) => ENGLISH_MARKERS.has(t)).length;
  const italian = words.filter((t) => ITALIAN_MARKERS.has(t)).length;
  return english > italian ? "en" : "it";
}
