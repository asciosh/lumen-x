namespace LumenX.Api.Chat;

/// <summary>
/// Riconosce quale delle domande che il codice sa risolvere sta facendo l'utente, senza AI.
///
/// Ogni intento ha un elenco di "indizi" (radici di parola o frasi) con un peso. Il punteggio di un intento e'
/// la somma dei pesi degli indizi trovati; vince il punteggio piu' alto e, a parita', l'intento che sta prima
/// nell'elenco (le domande piu' specifiche, come "quanto ordinare", precedono quelle generiche, come "quanto ho venduto").
/// Se nessun indizio compare la domanda e' <see cref="DataIntent.Unknown"/>: meglio dire "non ho capito" che indovinare.
/// </summary>
public static class IntentClassifier
{
    // L'ORDINE conta: e' la priorita' a parita' di punteggio.
    private static readonly (DataIntent Intent, (string Cue, int Weight)[] Cues)[] Rules =
    {
        (DataIntent.Reorder, new[] { ("ordin", 6), ("riordin", 6), ("rifornir", 3), ("scort", 1), ("magazzin", 1), ("order", 6), ("reorder", 2), ("restock", 3), ("stock", 1), ("inventor", 1) }),
        (DataIntent.Reliability, new[] { ("affidabil", 6), ("reliab", 6), ("precis", 2), ("accura", 2), ("fidar", 2), ("error", 2), ("incertez", 2), ("uncertain", 2), ("trust", 2), ("confiden", 2), ("sbagli", 2) }),
        (DataIntent.Summary, new[] { ("spieg", 6), ("explain", 6), ("riassum", 6), ("summar", 6), ("sintesi", 6), ("panoramica", 6), ("overview", 6), ("raccont", 2), ("tell me about", 6) }),
        (DataIntent.ForecastTotal, new[] { ("prevedo", 3), ("prevedi", 3), ("previsi", 2), ("prossim", 3), ("futur", 2), ("vendero", 3), ("venderemo", 3), ("aspett", 2), ("stima", 2), ("forecast", 3), ("predict", 3), ("expect", 2), ("next", 3), ("will", 1), ("upcoming", 3), ("coming", 2), ("future", 2) }),
        (DataIntent.ComparePeriods, new[] { ("rispetto", 3), ("confront", 3), ("compar", 3), ("versus", 3), ("vs", 3), ("andament", 2), ("andando", 2), ("trend", 2), ("cresc", 2), ("calo", 2), ("cala", 2), ("aument", 2), ("diminu", 2), ("scors", 1), ("precedent", 2), ("previous", 2), ("grow", 2), ("drop", 2), ("change", 1), ("vanno", 2), ("variaz", 2) }),
        (DataIntent.WeekdayPattern, new[] { ("della settimana", 3), ("of the week", 3), ("quale giorno", 3), ("che giorno", 3), ("which day", 3), ("what day", 3), ("weekday", 3), ("settimanal", 2), ("piu forte", 2), ("piu debole", 2), ("strongest", 2), ("weakest", 2), ("luned", 3), ("marted", 3), ("mercoled", 3), ("gioved", 3), ("venerd", 3), ("sabat", 3), ("domenic", 3), ("monday", 3), ("tuesday", 3), ("wednesday", 3), ("thursday", 3), ("friday", 3), ("saturday", 3), ("sunday", 3) }),
        (DataIntent.PeakDay, new[] { ("record", 3), ("picco", 3), ("massimo", 2), ("minimo", 2), ("giorno migliore", 3), ("miglior giorno", 3), ("giorno peggiore", 3), ("peggior giorno", 3), ("best day", 3), ("worst day", 3), ("peak", 3), ("highest", 2), ("lowest", 2), ("maximum", 2), ("minimum", 2) }),
        (DataIntent.SalesTotal, new[] { ("vendut", 3), ("vend", 1), ("sold", 3), ("sell", 2), ("sales", 1), ("units", 1), ("unita", 1), ("incass", 2), ("fattur", 2), ("ricav", 2), ("guadagn", 2), ("revenue", 2), ("income", 2), ("earn", 2), ("profit", 2), ("total", 1), ("media", 1), ("average", 1) }),
    };

    public static (DataIntent Intent, int Score) Classify(string normalized)
    {
        var tokens = QuestionText.Tokens(normalized);
        var best = DataIntent.Unknown;
        var bestScore = 0;

        foreach (var (intent, cues) in Rules)
        {
            var score = Score(normalized, tokens, cues);
            if (score > bestScore)
            {
                best = intent;
                bestScore = score;
            }
        }

        return (best, bestScore);
    }

    private static int Score(string normalized, string[] tokens, (string Cue, int Weight)[] cues)
    {
        var padded = " " + normalized + " ";
        var score = 0;

        foreach (var (cue, weight) in cues)
        {
            // Una frase intera deve comparire cosi' com'e'; una singola parola e' una radice: basta che inizi cosi'.
            var hit = cue.Contains(' ')
                ? padded.Contains(" " + cue + " ")
                : tokens.Any(t => t.StartsWith(cue, StringComparison.Ordinal));
            if (hit)
            {
                score += weight;
            }
        }

        return score;
    }
}
