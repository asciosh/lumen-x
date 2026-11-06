using System.Globalization;

namespace LumenX.Api.Explanations;

/// <summary>Spiegazione scritta dal codice, in italiano o inglese: gratis, offline, senza AI.</summary>
public sealed class TemplateExplainer : IExplainer
{
    // Sopra questa percentuale di giorni a zero la serie e' "intermittente" e la previsione poco affidabile.
    private const double IntermittentThresholdPercent = 20;

    // Formati numerici espliciti: non dipendono dalle culture installate (nei container possono mancare).
    private static readonly NumberFormatInfo ItNumbers = new()
    {
        NumberDecimalSeparator = ",",
        NumberGroupSeparator = ".",
        NumberGroupSizes = new[] { 3 }
    };

    private static readonly NumberFormatInfo EnNumbers = new()
    {
        NumberDecimalSeparator = ".",
        NumberGroupSeparator = ",",
        NumberGroupSizes = new[] { 3 }
    };

    private static readonly Dictionary<string, string> ItWeekdays = new()
    {
        ["Monday"] = "lunedì", ["Tuesday"] = "martedì", ["Wednesday"] = "mercoledì",
        ["Thursday"] = "giovedì", ["Friday"] = "venerdì", ["Saturday"] = "sabato", ["Sunday"] = "domenica"
    };

    public Task<ExplanationResult> ExplainAsync(
        ExplanationFacts facts, string language, CancellationToken cancellationToken = default)
    {
        var text = Explain(facts, language);
        return Task.FromResult(new ExplanationResult(text, "template"));
    }

    public static string Explain(ExplanationFacts facts, string language) =>
        language == ExplanationLanguage.English ? BuildEnglish(facts) : BuildItalian(facts);

    // ---------- formattazione ----------

    private static string Qty(double v, bool it)
    {
        var decimals = Math.Abs(v) >= 100 ? 0 : 1;
        return v.ToString("N" + decimals, it ? ItNumbers : EnNumbers);
    }

    private static string Pct(double v, bool it)
    {
        var decimals = Math.Abs(v) >= 10 ? 0 : 1;
        return Math.Abs(v).ToString("N" + decimals, it ? ItNumbers : EnNumbers);
    }

    private static string ItDate(DateOnly d) => d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    private static string EnDate(DateOnly d) => d.ToString("d MMM yyyy", CultureInfo.InvariantCulture);

    private static string DaysIt(int n) => n == 1 ? "1 giorno" : $"{n} giorni";

    private static string DaysEn(int n) => n == 1 ? "1 day" : $"{n} days";

    // "blend" e' il nome tecnico della media di ETS e LightGBM: nel testo si scrive per esteso.
    private static string MethodLabel(string method, bool it) =>
        method == "blend" ? (it ? "media di ETS e LightGBM" : "average of ETS and LightGBM") : method;

    private static string WeekdayIt(string englishName) =>
        ItWeekdays.TryGetValue(englishName, out var it) ? it : englishName;

    // ---------- italiano ----------

    private static string BuildItalian(ExplanationFacts f)
    {
        var parts = new List<string>();

        var range = f.ForecastStart == f.ForecastEnd
            ? ItDate(f.ForecastStart)
            : $"dal {ItDate(f.ForecastStart)} al {ItDate(f.ForecastEnd)}";
        parts.Add($"Per «{f.ProductName}» prevedo circa {Qty(f.ForecastTotal, true)} unità su {DaysIt(f.Horizon)} ({range}), cioè {Qty(f.ForecastAvgPerDay, true)} al giorno.");

        if (f.ChangePercent is double change)
        {
            var days = DaysIt(f.ReferenceDays);
            var refAvg = Qty(f.ReferenceAvgPerDay, true);
            if (Math.Abs(change) < 2)
            {
                parts.Add($"È in linea con gli ultimi {days} di vendite ({refAvg} al giorno).");
            }
            else if (change > 0)
            {
                parts.Add($"Sono il {Pct(change, true)}% in più rispetto agli ultimi {days} ({refAvg} al giorno).");
            }
            else
            {
                parts.Add($"Sono il {Pct(change, true)}% in meno rispetto agli ultimi {days} ({refAvg} al giorno).");
            }
        }

        if (f.StrongestWeekday is not null && f.WeakestWeekday is not null
            && f.StrongestWeekdayAvg is double sAvg && f.WeakestWeekdayAvg is double wAvg)
        {
            parts.Add($"Il giorno più forte è {WeekdayIt(f.StrongestWeekday)} (circa {Qty(sAvg, true)} unità), il più debole {WeekdayIt(f.WeakestWeekday)} (circa {Qty(wAvg, true)}).");
        }

        if (f.IntervalHalfWidthPercent is double width)
        {
            parts.Add($"L'intervallo di confidenza è di circa ±{Pct(width, true)}% attorno al valore centrale: più è ampio, più la previsione è incerta.");
        }

        if (f.MaeUsed is double mae)
        {
            var check = f.HoldoutDays > 0 ? $"Nella verifica sugli ultimi {DaysIt(f.HoldoutDays)}" : "Nella verifica";
            var sentence = $"{check} il metodo scelto ({MethodLabel(f.MethodUsed, true)}) ha sbagliato in media di {Qty(mae, true)} unità al giorno";
            if (f.ImprovementVsNaivePercent is double imp)
            {
                sentence += imp > 0
                    ? $", il {Pct(imp, true)}% in meno del metodo semplice di confronto (naive)."
                    : ", non meglio del metodo semplice di confronto (naive): conviene usare la previsione con cautela.";
            }
            else
            {
                sentence += ".";
            }
            parts.Add(sentence);
        }

        if (f.FilledMissingDays > 0)
        {
            parts.Add($"Nello storico mancavano {DaysIt(f.FilledMissingDays)} di dati, stimati per interpolazione.");
        }

        if (f.ZeroDaysPercent >= IntermittentThresholdPercent)
        {
            parts.Add($"Nello storico il {Pct(f.ZeroDaysPercent, true)}% dei giorni ha vendite pari a zero: con una serie così discontinua la previsione è poco affidabile.");
        }

        return string.Join(" ", parts);
    }

    // ---------- inglese ----------

    private static string BuildEnglish(ExplanationFacts f)
    {
        var parts = new List<string>();

        var range = f.ForecastStart == f.ForecastEnd
            ? EnDate(f.ForecastStart)
            : $"from {EnDate(f.ForecastStart)} to {EnDate(f.ForecastEnd)}";
        parts.Add($"For “{f.ProductName}” I forecast about {Qty(f.ForecastTotal, false)} units over {DaysEn(f.Horizon)} ({range}), or {Qty(f.ForecastAvgPerDay, false)} per day.");

        if (f.ChangePercent is double change)
        {
            var reference = $"the last {DaysEn(f.ReferenceDays)}";
            var refAvg = Qty(f.ReferenceAvgPerDay, false);
            if (Math.Abs(change) < 2)
            {
                parts.Add($"That is in line with {reference} ({refAvg} per day).");
            }
            else if (change > 0)
            {
                parts.Add($"That is {Pct(change, false)}% higher than {reference} ({refAvg} per day).");
            }
            else
            {
                parts.Add($"That is {Pct(change, false)}% lower than {reference} ({refAvg} per day).");
            }
        }

        if (f.StrongestWeekday is not null && f.WeakestWeekday is not null
            && f.StrongestWeekdayAvg is double sAvg && f.WeakestWeekdayAvg is double wAvg)
        {
            parts.Add($"The strongest day is {f.StrongestWeekday} (about {Qty(sAvg, false)} units) and the weakest is {f.WeakestWeekday} (about {Qty(wAvg, false)}).");
        }

        if (f.IntervalHalfWidthPercent is double width)
        {
            parts.Add($"The confidence interval is about ±{Pct(width, false)}% around the central value: the wider it is, the more uncertain the forecast.");
        }

        if (f.MaeUsed is double mae)
        {
            var check = f.HoldoutDays > 0 ? $"In the check on the last {DaysEn(f.HoldoutDays)}" : "In the check";
            var sentence = $"{check}, the chosen method ({MethodLabel(f.MethodUsed, false)}) was off by {Qty(mae, false)} units per day on average";
            if (f.ImprovementVsNaivePercent is double imp)
            {
                sentence += imp > 0
                    ? $", {Pct(imp, false)}% less than the simple benchmark method (naive)."
                    : ", no better than the simple benchmark method (naive), so treat the forecast with caution.";
            }
            else
            {
                sentence += ".";
            }
            parts.Add(sentence);
        }

        if (f.FilledMissingDays > 0)
        {
            parts.Add($"{DaysEn(f.FilledMissingDays)} of history were missing and were estimated by interpolation.");
        }

        if (f.ZeroDaysPercent >= IntermittentThresholdPercent)
        {
            parts.Add($"{Pct(f.ZeroDaysPercent, false)}% of the days in the history have zero sales: with such an intermittent series the forecast is not very reliable.");
        }

        return string.Join(" ", parts);
    }
}
