using System.Globalization;
using System.Text.RegularExpressions;

namespace LumenX.Api.Chat;

public enum PeriodKind
{
    None,
    LastDays,
    CalendarMonth
}

/// <summary>Il periodo nominato nella domanda: "ultimi N giorni" oppure un mese del calendario (con anno facoltativo).</summary>
public sealed record PeriodSpec(PeriodKind Kind, int Days = 0, int Year = 0, int Month = 0);

/// <summary>Il periodo risolto in date reali, riferito all'ultimo giorno di dati e non alla data di oggi.</summary>
public sealed record PeriodRange(DateOnly Start, DateOnly End, PeriodKind Kind, int Year, int Month);

/// <summary>
/// Estrae dal testo (gia' normalizzato) il periodo di cui si parla. Regole, tutte riferite all'ULTIMO GIORNO DI DATI:
/// "ultimi 30 giorni" sono i 30 giorni che finiscono li'; una settimana vale 7 giorni, un mese 30, un anno 365;
/// "a marzo" e' il mese di calendario (senza anno, il piu' recente non successivo all'ultimo giorno di dati).
/// </summary>
public static class PeriodParser
{
    private const int MaxDays = 3650;

    private static readonly Regex LastPeriod = new(
        @"\b(?:ultim[oiae]|last|past)\s+(?:(\d{1,3})\s+|([a-z]+)\s+)?(giorn[oi]|settiman[ae]|mes[ei]|ann[oi]|days?|weeks?|months?|years?)\b",
        RegexOptions.Compiled);

    private static readonly Regex FuturePeriod = new(
        @"\b(?:prossim[oiae]|next|coming|upcoming)\s+(?:(\d{1,3})\s+|([a-z]+)\s+)?(giorn[oi]|settiman[ae]|mes[ei]|days?|weeks?|months?)\b",
        RegexOptions.Compiled);

    private static readonly Regex YearToken = new(@"\b(20\d{2})\b", RegexOptions.Compiled);

    private static readonly Dictionary<string, int> NumberWords = new()
    {
        ["un"] = 1, ["uno"] = 1, ["una"] = 1, ["one"] = 1, ["due"] = 2, ["two"] = 2, ["tre"] = 3, ["three"] = 3,
        ["quattro"] = 4, ["four"] = 4, ["cinque"] = 5, ["five"] = 5, ["sei"] = 6, ["six"] = 6, ["sette"] = 7,
        ["seven"] = 7, ["otto"] = 8, ["eight"] = 8, ["nove"] = 9, ["nine"] = 9, ["dieci"] = 10, ["ten"] = 10,
        ["undici"] = 11, ["eleven"] = 11, ["dodici"] = 12, ["twelve"] = 12
    };

    private static readonly Dictionary<string, int> MonthNames = new()
    {
        ["gennaio"] = 1, ["febbraio"] = 2, ["marzo"] = 3, ["aprile"] = 4, ["maggio"] = 5, ["giugno"] = 6,
        ["luglio"] = 7, ["agosto"] = 8, ["settembre"] = 9, ["ottobre"] = 10, ["novembre"] = 11, ["dicembre"] = 12,
        ["january"] = 1, ["february"] = 2, ["march"] = 3, ["april"] = 4, ["may"] = 5, ["june"] = 6,
        ["july"] = 7, ["august"] = 8, ["september"] = 9, ["october"] = 10, ["november"] = 11, ["december"] = 12
    };

    /// <summary>I mesi nominati, nell'ordine in cui compaiono e senza ripetizioni.</summary>
    public static IReadOnlyList<int> MonthsMentioned(string normalized)
    {
        var months = new List<int>();
        foreach (var token in QuestionText.Tokens(normalized))
        {
            if (MonthNames.TryGetValue(token, out var month) && !months.Contains(month))
            {
                months.Add(month);
            }
        }

        return months;
    }

    /// <summary>Il periodo passato: "ultimi N giorni/settimane/mesi" oppure un mese del calendario.</summary>
    public static PeriodSpec ParseLast(string normalized)
    {
        var match = LastPeriod.Match(normalized);
        if (match.Success && TryDays(match, out var days))
        {
            return new PeriodSpec(PeriodKind.LastDays, days);
        }

        var months = MonthsMentioned(normalized);
        if (months.Count > 0)
        {
            var yearMatch = YearToken.Match(normalized);
            var year = yearMatch.Success ? int.Parse(yearMatch.Value, CultureInfo.InvariantCulture) : 0;
            return new PeriodSpec(PeriodKind.CalendarMonth, 0, year, months[0]);
        }

        return new PeriodSpec(PeriodKind.None);
    }

    /// <summary>Quanti giorni nel futuro: "prossime 2 settimane" vale 14. Null se la domanda non lo dice.</summary>
    public static int? ParseFutureDays(string normalized)
    {
        var match = FuturePeriod.Match(normalized);
        return match.Success && TryDays(match, out var days) ? days : null;
    }

    public static PeriodRange Resolve(PeriodSpec spec, DateOnly firstDay, DateOnly lastDay, int defaultDays)
    {
        switch (spec.Kind)
        {
            case PeriodKind.CalendarMonth:
            {
                var year = spec.Year != 0 ? spec.Year : lastDay.Year;
                if (spec.Year == 0 && new DateOnly(year, spec.Month, 1) > lastDay)
                {
                    year--;
                }

                var start = new DateOnly(year, spec.Month, 1);
                var end = new DateOnly(year, spec.Month, DateTime.DaysInMonth(year, spec.Month));
                return new PeriodRange(start, end, PeriodKind.CalendarMonth, year, spec.Month);
            }
            case PeriodKind.LastDays:
                return new PeriodRange(lastDay.AddDays(-(spec.Days - 1)), lastDay, PeriodKind.LastDays, 0, 0);
            default:
                return new PeriodRange(lastDay.AddDays(-(defaultDays - 1)), lastDay, PeriodKind.None, 0, 0);
        }
    }

    // Gruppi del regex: 1 = numero in cifre, 2 = parola (forse un numero scritto a lettere), 3 = unita'.
    private static bool TryDays(Match match, out int days)
    {
        days = 0;
        var digits = match.Groups[1].Value;
        var word = match.Groups[2].Value;
        var unit = match.Groups[3].Value;

        int count;
        if (digits.Length > 0)
        {
            count = int.Parse(digits, CultureInfo.InvariantCulture);
        }
        else if (word.Length > 0 && NumberWords.TryGetValue(word, out var fromWord))
        {
            count = fromWord;
        }
        else if (IsPlural(unit))
        {
            return false;   // "ultimi giorni" senza numero: non so quanti
        }
        else
        {
            count = 1;      // "ultimo mese", "last week"
        }

        if (count < 1)
        {
            return false;
        }

        days = Math.Min(count * UnitDays(unit), MaxDays);
        return true;
    }

    private static bool IsPlural(string unit) =>
        unit is "giorni" or "settimane" or "mesi" or "anni" or "days" or "weeks" or "months" or "years";

    private static int UnitDays(string unit)
    {
        if (unit.StartsWith("settiman", StringComparison.Ordinal) || unit.StartsWith("week", StringComparison.Ordinal)) return 7;
        if (unit.StartsWith("mes", StringComparison.Ordinal) || unit.StartsWith("month", StringComparison.Ordinal)) return 30;
        if (unit.StartsWith("ann", StringComparison.Ordinal) || unit.StartsWith("year", StringComparison.Ordinal)) return 365;
        return 1;
    }
}
