using System.Text;
using System.Text.RegularExpressions;

namespace LumenX.Api.Chat;

/// <summary>Pulizia del testo della domanda e riconoscimento della lingua.</summary>
public static class QuestionText
{
    // Accenti tolti a mano: la normalizzazione Unicode di .NET dipende dalle librerie ICU, che nei container possono mancare.
    private static readonly Dictionary<char, char> Folds = new()
    {
        ['à'] = 'a', ['á'] = 'a', ['â'] = 'a', ['ä'] = 'a',
        ['è'] = 'e', ['é'] = 'e', ['ê'] = 'e', ['ë'] = 'e',
        ['ì'] = 'i', ['í'] = 'i', ['î'] = 'i', ['ï'] = 'i',
        ['ò'] = 'o', ['ó'] = 'o', ['ô'] = 'o', ['ö'] = 'o',
        ['ù'] = 'u', ['ú'] = 'u', ['û'] = 'u', ['ü'] = 'u',
        ['ç'] = 'c', ['ñ'] = 'n'
    };

    // Parole che compaiono (quasi) solo in una delle due lingue.
    private static readonly HashSet<string> ItalianMarkers = new()
    {
        "quanto", "quanti", "ho", "venduto", "vendite", "ultimi", "ultimo", "ultime", "giorni", "giorno", "settimana",
        "settimane", "mese", "mesi", "previsione", "previsioni", "qual", "quale", "migliore", "ordinare", "prossimi",
        "prossime", "rispetto", "affidabile", "spiega", "spiegami", "unita", "il", "lo", "la", "le", "gli", "di", "del",
        "della", "che", "come", "sono", "nel", "nella", "per", "un", "una", "cosa", "conviene", "vanno", "mio", "mia"
    };

    private static readonly HashSet<string> EnglishMarkers = new()
    {
        "the", "how", "much", "many", "did", "sold", "sell", "last", "days", "day", "week", "weeks", "month", "months",
        "forecast", "what", "which", "best", "worst", "order", "next", "compared", "reliable", "explain", "units", "my",
        "was", "are", "is", "of", "to", "for", "with", "than"
    };

    /// <summary>Minuscolo, senza accenti, solo lettere e cifre separate da uno spazio ("l'ultimo" diventa "l ultimo").</summary>
    public static string Normalize(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var raw in text.Trim().ToLowerInvariant())
        {
            var c = Folds.TryGetValue(raw, out var folded) ? folded : raw;
            sb.Append(char.IsLetterOrDigit(c) ? c : ' ');
        }

        return Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
    }

    public static string[] Tokens(string normalized) =>
        normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries);

    /// <summary>"it" oppure "en": vince la lingua con piu' parole riconosciute; a parita' l'italiano.</summary>
    public static string DetectLanguage(string normalized)
    {
        var tokens = Tokens(normalized);
        var english = tokens.Count(t => EnglishMarkers.Contains(t));
        var italian = tokens.Count(t => ItalianMarkers.Contains(t));
        return english > italian ? "en" : "it";
    }
}
