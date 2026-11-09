using System.Text;
using System.Text.RegularExpressions;

namespace LumenX.Api.Chat;

/// <summary>Cleaning of the question text and language detection.</summary>
public static class QuestionText
{
    // Accents removed by hand: .NET's Unicode normalization depends on the ICU libraries, which may be missing in containers.
    private static readonly Dictionary<char, char> Folds = new()
    {
        ['à'] = 'a', ['á'] = 'a', ['â'] = 'a', ['ä'] = 'a',
        ['è'] = 'e', ['é'] = 'e', ['ê'] = 'e', ['ë'] = 'e',
        ['ì'] = 'i', ['í'] = 'i', ['î'] = 'i', ['ï'] = 'i',
        ['ò'] = 'o', ['ó'] = 'o', ['ô'] = 'o', ['ö'] = 'o',
        ['ù'] = 'u', ['ú'] = 'u', ['û'] = 'u', ['ü'] = 'u',
        ['ç'] = 'c', ['ñ'] = 'n'
    };

    // Words that appear (almost) only in one of the two languages.
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

    /// <summary>Lowercase, no accents, only letters and digits separated by a space ("l'ultimo" becomes "l ultimo").</summary>
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

    /// <summary>"it" or "en": the language with more recognized words wins; on a tie, Italian.</summary>
    public static string DetectLanguage(string normalized)
    {
        var tokens = Tokens(normalized);
        var english = tokens.Count(t => EnglishMarkers.Contains(t));
        var italian = tokens.Count(t => ItalianMarkers.Contains(t));
        return english > italian ? "en" : "it";
    }
}
