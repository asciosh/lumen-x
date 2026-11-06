using System.Globalization;
using System.Text.RegularExpressions;

namespace LumenX.Api.Explanations;

/// <summary>
/// Controlla che i numeri scritti da un LLM compaiano tra i fatti calcolati dal codice.
/// Un testo che contiene cifre non presenti nei fatti viene scartato dal chiamante.
///
/// Limiti: e' un controllo prudente, non una prova. Accetta arrotondamenti (entro il 1% o
/// l'ultima cifra scritta) e le cifre di date e nome del prodotto, quindi puo' lasciar passare
/// una cifra inventata che coincide per caso con una di queste, e puo' scartare testi corretti
/// che usano formati inattesi (per esempio uno spazio come separatore delle migliaia).
/// </summary>
public static class NumberGuard
{
    private static readonly Regex NumberToken = new(@"\d+(?:[.,]\d+)*", RegexOptions.Compiled);
    private static readonly Regex Digits = new(@"\d+", RegexOptions.Compiled);

    /// <summary>I numeri del testo che non corrispondono a nessun fatto (senza duplicati).</summary>
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

        // Variazioni e differenze possono essere scritte senza segno ("il 4% in piu'").
        AddAbs(values, f.ChangePercent);
        AddAbs(values, f.StrongestWeekdayAvg);
        AddAbs(values, f.WeakestWeekdayAvg);
        AddAbs(values, f.IntervalHalfWidthPercent);
        AddAbs(values, f.MaeUsed);
        AddAbs(values, f.MaeNaive);
        AddAbs(values, f.ImprovementVsNaivePercent);

        // Giorno, mese e anno delle date: l'AI le scrive per esteso ("16 maggio 2026").
        foreach (var d in new[] { f.HistoryEnd, f.ForecastStart, f.ForecastEnd })
        {
            values.Add(d.Day);
            values.Add(d.Month);
            values.Add(d.Year);
        }

        // Le cifre che stanno nel nome del prodotto ("Pane 2024") sono legittime.
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

    /// <summary>Legge un numero con i separatori della lingua richiesta (it: 3.360,5 - en: 3,360.5).</summary>
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
                return false;   // piu' separatori decimali: formato non valido
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
