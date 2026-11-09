using System.Globalization;
using System.Text.RegularExpressions;

namespace LumenX.Api.Chat;

public enum PeriodKind
{
    None,
    LastDays,
    CalendarMonth
}

/// <summary>The period named in the question: "last N days" or a calendar month (with an optional year).</summary>
public sealed record PeriodSpec(PeriodKind Kind, int Days = 0, int Year = 0, int Month = 0);

/// <summary>The period resolved to real dates, relative to the last day of data and not to today's date.</summary>
public sealed record PeriodRange(DateOnly Start, DateOnly End, PeriodKind Kind, int Year, int Month);

/// <summary>
/// Extracts from the (already normalized) text the period being talked about. Rules, all relative to the LAST DAY OF DATA:
/// "last 30 days" (Italian "ultimi 30 giorni") are the 30 days ending there; a week is 7 days, a month 30, a year 365;
/// "in March" is the calendar month (without a year, the most recent one not after the last day of data).
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

    /// <summary>The months named, in order of appearance and without repetitions.</summary>
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

    /// <summary>The past period: "last N days/weeks/months" or a calendar month.</summary>
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

    /// <summary>How many days into the future: "next 2 weeks" is 14. Null if the question does not say.</summary>
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

    // Regex groups: 1 = number in digits, 2 = word (maybe a number written in letters), 3 = unit.
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
            return false;   // "last days" without a number: unknown how many
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
