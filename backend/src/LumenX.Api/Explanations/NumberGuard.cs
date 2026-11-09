using System.Globalization;
using System.Text.RegularExpressions;

namespace LumenX.Api.Explanations;

/// <summary>
/// Checks that the numbers written by an LLM appear among the facts computed by the code.
/// A text containing figures that are not in the facts is discarded by the caller.
///
/// Limits: it is a cautious check, not a proof. It accepts roundings (within 1% or
/// the last written digit) and the digits of dates and product name, so it may let through
/// an invented figure that happens to coincide with one of these, and it may discard correct texts
/// that use unexpected formats (for example a space as thousands separator).
/// </summary>
public static class NumberGuard
{
    private static readonly Regex NumberToken = new(@"\d+(?:[.,]\d+)*", RegexOptions.Compiled);
    private static readonly Regex Digits = new(@"\d+", RegexOptions.Compiled);

    /// <summary>The numbers in the text that match no fact (without duplicates).</summary>
    public static IReadOnlyList<string> FindUnsupportedNumbers(string text, ExplanationFacts facts, string language)
    {
        var allowed = AllowedValues(facts);
        var unsupported = new List<string>();

        foreach (Match match in NumberToken.Matches(text))
        {
            var ok = TryParse(match.Value, language, out var value, out var decimals)
                     && IsAllowed(value, decimals, allowed);
            if (!ok && !unsupported.Contains(match.Value))
            {
                unsupported.Add(match.Value);
            }
        }

        return unsupported;
    }

    private static List<double> AllowedValues(ExplanationFacts f)
    {
        var values = new List<double>
        {
            f.HistoryDays, f.Horizon, f.ReferenceDays, f.HoldoutDays, f.FilledMissingDays,
            f.ForecastTotal, f.ForecastAvgPerDay, f.ReferenceAvgPerDay, f.ZeroDaysPercent
        };

        // Changes and differences may be written without sign ("4% more").
        AddAbs(values, f.ChangePercent);
        AddAbs(values, f.StrongestWeekdayAvg);
        AddAbs(values, f.WeakestWeekdayAvg);
        AddAbs(values, f.IntervalHalfWidthPercent);
        AddAbs(values, f.MaeUsed);
        AddAbs(values, f.MaeNaive);
        AddAbs(values, f.ImprovementVsNaivePercent);

        // Day, month and year of the dates: the AI writes them in full ("16 May 2026").
        foreach (var d in new[] { f.HistoryEnd, f.ForecastStart, f.ForecastEnd })
        {
            values.Add(d.Day);
            values.Add(d.Month);
            values.Add(d.Year);
        }

        // Digits in the product name ("Bread 2024") are legitimate.
        foreach (Match m in Digits.Matches(f.ProductName))
        {
            values.Add(double.Parse(m.Value, CultureInfo.InvariantCulture));
        }

        return values;
    }

    private static void AddAbs(List<double> values, double? value)
    {
        if (value.HasValue)
        {
            values.Add(Math.Abs(value.Value));
        }
    }

    /// <summary>Reads a number with the separators of the requested language (it: 3.360,5 - en: 3,360.5).</summary>
    private static bool TryParse(string token, string language, out double value, out int decimals)
    {
        value = 0;
        decimals = 0;

        var decimalSeparator = language == ExplanationLanguage.English ? '.' : ',';
        var groupSeparator = language == ExplanationLanguage.English ? ',' : '.';

        var integerPart = token;
        var fraction = "";
        var lastDecimal = token.LastIndexOf(decimalSeparator);
        if (lastDecimal >= 0)
        {
            if (token.IndexOf(decimalSeparator) != lastDecimal)
            {
                return false;   // more than one decimal separator: invalid format
            }
            integerPart = token.Substring(0, lastDecimal);
            fraction = token.Substring(lastDecimal + 1);
            decimals = fraction.Length;
        }

        integerPart = integerPart.Replace(groupSeparator.ToString(), "");
        var normalized = fraction.Length > 0 ? integerPart + "." + fraction : integerPart;
        return double.TryParse(normalized, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }

    private static bool IsAllowed(double value, int decimals, List<double> allowed)
    {
        var roundingTolerance = 0.5 * Math.Pow(10, -decimals);
        foreach (var a in allowed)
        {
            var tolerance = Math.Max(roundingTolerance, 0.01 * Math.Abs(a));
            if (Math.Abs(value - a) <= tolerance + 1e-9)
            {
                return true;
            }
        }
        return false;
    }
}
