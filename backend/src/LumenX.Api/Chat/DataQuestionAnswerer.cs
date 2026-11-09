using LumenX.Api.Contracts;
using LumenX.Api.Explanations;
using LumenX.Api.Reorder;

namespace LumenX.Api.Chat;

/// <summary>
/// Risponde alle domande sui dati. Nessuna AI e nessun numero inventato: la domanda viene ricondotta a una di quelle
/// che il codice sa risolvere (<see cref="DataIntent"/>), la risposta e' calcolata sui dati e scritta con frasi fisse.
/// I periodi sono sempre riferiti all'ultimo giorno di dati, non alla data di oggi.
/// </summary>
public static class DataQuestionAnswerer
{
    private const int DefaultSalesDays = 30;
    private const int DefaultPeakDays = 90;
    private const int DefaultCompareDays = 28;
    private const int WeekdayWindowDays = 84;
    private const int MinWeekdayDays = 14;

    // Parole che parlano di soldi: il sistema ha solo le quantita', non i prezzi.
    private static readonly string[] MoneyStems =
    {
        "incass", "fattur", "ricav", "guadagn", "soldi", "euro", "revenue", "income", "earn", "profit", "money"
    };

    private static readonly string[] ItalianExamples =
    {
        "Quanto ho venduto negli ultimi 30 giorni?",
        "Come vanno le vendite rispetto al mese scorso?",
        "Qual è il giorno più forte della settimana?",
        "Quanto prevedo di vendere nelle prossime 2 settimane?",
        "Cosa conviene ordinare?",
        "Quanto è affidabile la previsione?",
        "Spiegami la previsione",
        "Qual è stato il giorno record?"
    };

    private static readonly string[] EnglishExamples =
    {
        "How much did I sell in the last 30 days?",
        "How are sales doing compared to last month?",
        "Which day of the week sells best?",
        "How much will I sell in the next 2 weeks?",
        "What should I order?",
        "How reliable is the forecast?",
        "Explain the forecast",
        "What was my record day?"
    };

    /// <summary>Domande di esempio che il sistema sa sicuramente capire.</summary>
    public static IReadOnlyList<string> Examples(string language) =>
        language == ExplanationLanguage.English ? EnglishExamples : ItalianExamples;

    public static AskAnswer Answer(string question, string language, AskContext context)
    {
        var it = language != ExplanationLanguage.English;
        var normalized = QuestionText.Normalize(question);
        var (intent, _) = IntentClassifier.Classify(normalized);

        if (intent == DataIntent.Unknown)
        {
            return new AskAnswer(intent, UnknownText(it), false, Examples(language));
        }

        var sales = context.Sales.OrderBy(s => s.Date).ToList();
        if (sales.Count == 0)
        {
            var empty = it
                ? "Non ci sono ancora vendite per questo prodotto: importa un CSV e poi chiedimi pure."
                : "There are no sales for this product yet: import a CSV and then ask away.";
            return new AskAnswer(intent, empty, true, Array.Empty<string>());
        }

        string text = intent switch
        {
            DataIntent.SalesTotal => SalesTotal(normalized, sales, it),
            DataIntent.ComparePeriods => ComparePeriods(normalized, sales, it),
            DataIntent.WeekdayPattern => WeekdayPattern(sales, it),
            DataIntent.PeakDay => PeakDay(normalized, sales, it),
            DataIntent.ForecastTotal => ForecastTotal(normalized, context, it),
            DataIntent.Reorder => ReorderText(context, it),
            DataIntent.Reliability => ReliabilityText(sales, context, it),
            DataIntent.Summary => SummaryText(sales, context, language),
            _ => UnknownText(it)
        };

        if (AsksAboutMoney(normalized) && intent != DataIntent.Summary && intent != DataIntent.Reliability)
        {
            text = MoneyNote(it) + text;
        }

        return new AskAnswer(intent, text, true, Array.Empty<string>());
    }

    private static bool AsksAboutMoney(string normalized) =>
        QuestionText.Tokens(normalized).Any(t => MoneyStems.Any(stem => t.StartsWith(stem, StringComparison.Ordinal)));

    private static string MoneyNote(bool it) => it
        ? "Non conosco i prezzi, quindi non posso parlare di incassi: ti rispondo con le unità vendute. "
        : "I do not have prices, so I cannot talk about revenue: here are the units sold. ";

    // ------------------------------------------------------------------ vendite

    private static string SalesTotal(string normalized, List<SalePointDto> sales, bool it)
    {
        var first = sales[0].Date;
        var last = sales[^1].Date;
        var range = PeriodParser.Resolve(PeriodParser.ParseLast(normalized), first, last, DefaultSalesDays);
        var inRange = sales.Where(s => s.Date >= range.Start && s.Date <= range.End).ToList();

        if (inRange.Count == 0)
        {
            return it
                ? $"Non ho vendite tra il {D(range.Start, it)} e il {D(range.End, it)}: i dati vanno dal {D(first, it)} al {D(last, it)}."
                : $"I have no sales between {D(range.Start, it)} and {D(range.End, it)}: the data goes from {D(first, it)} to {D(last, it)}.";
        }

        var total = inRange.Sum(s => s.Quantity);
        var average = total / inRange.Count;
        var label = PeriodLabel(range, inRange, it);
        var days = NumberText.Days(inRange.Count, it);

        var text = it
            ? $"{label} ({days}) hai venduto {Qty(total, it)} unità, cioè {Qty(average, it)} al giorno."
            : $"{label} ({days}) you sold {Qty(total, it)} units, or {Qty(average, it)} per day.";

        if (range.Start < first || range.End > last)
        {
            text += it
                ? $" I dati disponibili vanno dal {D(first, it)} al {D(last, it)}."
                : $" The available data goes from {D(first, it)} to {D(last, it)}.";
        }

        return text;
    }

    private static string ComparePeriods(string normalized, List<SalePointDto> sales, bool it)
    {
        if (PeriodParser.MonthsMentioned(normalized).Count >= 2)
        {
            return it
                ? "Il confronto tra due mesi nominati non è ancora supportato: prova «Come vanno le vendite rispetto al mese scorso?»."
                : "Comparing two named months is not supported yet: try \"How are sales doing compared to last month?\".";
        }

        var first = sales[0].Date;
        var last = sales[^1].Date;
        var spec = PeriodParser.ParseLast(normalized);

        int window;
        if (spec.Kind == PeriodKind.LastDays)
        {
            window = spec.Days;
        }
        else if (normalized.Contains("settiman") || normalized.Contains("week"))
        {
            window = 7;
        }
        else if (normalized.Contains("mese") || normalized.Contains("mesi") || normalized.Contains("month"))
        {
            window = 30;
        }
        else
        {
            window = DefaultCompareDays;
        }

        var span = last.DayNumber - first.DayNumber + 1;
        if (span < 2 * window)
        {
            return it
                ? $"Per confrontare due periodi da {NumberText.Days(window, it)} servono almeno {NumberText.Days(2 * window, it)} di storico: ne ho {NumberText.Days(span, it)}."
                : $"To compare two periods of {NumberText.Days(window, it)} I need at least {NumberText.Days(2 * window, it)} of history: I have {NumberText.Days(span, it)}.";
        }

        var currentStart = last.AddDays(-(window - 1));
        var previousEnd = currentStart.AddDays(-1);
        var previousStart = previousEnd.AddDays(-(window - 1));
        var current = sales.Where(s => s.Date >= currentStart).ToList();
        var previous = sales.Where(s => s.Date >= previousStart && s.Date <= previousEnd).ToList();
        var currentTotal = current.Sum(s => s.Quantity);
        var previousTotal = previous.Sum(s => s.Quantity);
        var days = NumberText.Days(window, it);

        var head = it
            ? $"Negli ultimi {days} (dal {D(currentStart, it)} al {D(last, it)}) hai venduto {Qty(currentTotal, it)} unità"
            : $"In the last {days} (from {D(currentStart, it)} to {D(last, it)}) you sold {Qty(currentTotal, it)} units";

        string tail;
        if (previousTotal <= 0)
        {
            tail = it
                ? "; nel periodo precedente non risultano vendite."
                : "; there are no sales in the previous period.";
        }
        else
        {
            var change = (currentTotal - previousTotal) / previousTotal * 100.0;
            if (Math.Abs(change) < 2)
            {
                tail = it
                    ? $", contro {Qty(previousTotal, it)} nei {days} precedenti: praticamente invariato (meno del 2% di differenza)."
                    : $", against {Qty(previousTotal, it)} in the previous {days}: practically unchanged (less than 2% difference).";
            }
            else
            {
                tail = it
                    ? $", contro {Qty(previousTotal, it)} nei {days} precedenti: il {NumberText.Pct(change, it)}% in {(change > 0 ? "più" : "meno")}."
                    : $", against {Qty(previousTotal, it)} in the previous {days}: {NumberText.Pct(change, it)}% {(change > 0 ? "more" : "less")}.";
            }
        }

        var note = current.Count != window || previous.Count != window
            ? (it ? $" Giorni con dati: {current.Count} e {previous.Count}." : $" Days with data: {current.Count} and {previous.Count}.")
            : "";

        return head + tail + note;
    }

    private static string WeekdayPattern(List<SalePointDto> sales, bool it)
    {
        var last = sales[^1].Date;
        var window = sales.Where(s => s.Date >= last.AddDays(-(WeekdayWindowDays - 1))).ToList();

        if (window.Count < MinWeekdayDays)
        {
            return it
                ? $"Servono almeno {NumberText.Days(MinWeekdayDays, it)} di vendite per capire quali giorni della settimana vanno meglio."
                : $"I need at least {NumberText.Days(MinWeekdayDays, it)} of sales to tell which weekdays do best.";
        }

        var byDay = window
            .GroupBy(s => s.Date.DayOfWeek)
            .Select(g => new { Day = g.Key, Average = g.Average(s => s.Quantity) })
            .ToList();
        var top = byDay.OrderByDescending(x => x.Average).ThenBy(x => x.Day).First();
        var bottom = byDay.OrderBy(x => x.Average).ThenBy(x => x.Day).First();
        var overall = window.Average(s => s.Quantity);
        var days = NumberText.Days(window.Count, it);

        if (top.Day == bottom.Day || (top.Average - bottom.Average) / Math.Max(overall, 0.000001) < 0.05)
        {
            return it
                ? $"Guardando gli ultimi {days} di dati, le vendite sono molto regolari durante la settimana: nessun giorno si distingue davvero."
                : $"Looking at the last {days} of data, sales are very even across the week: no day really stands out.";
        }

        return it
            ? $"Guardando gli ultimi {days} di dati, il giorno più forte è {NumberText.Weekday(top.Day, it)} (in media {Qty(top.Average, it)} unità) e il più debole {NumberText.Weekday(bottom.Day, it)} ({Qty(bottom.Average, it)})."
            : $"Looking at the last {days} of data, the strongest day is {NumberText.Weekday(top.Day, it)} (about {Qty(top.Average, it)} units on average) and the weakest is {NumberText.Weekday(bottom.Day, it)} ({Qty(bottom.Average, it)}).";
    }

    private static string PeakDay(string normalized, List<SalePointDto> sales, bool it)
    {
        var first = sales[0].Date;
        var last = sales[^1].Date;
        var range = PeriodParser.Resolve(PeriodParser.ParseLast(normalized), first, last, DefaultPeakDays);
        var inRange = sales.Where(s => s.Date >= range.Start && s.Date <= range.End).ToList();

        if (inRange.Count == 0)
        {
            return it
                ? $"Non ho vendite tra il {D(range.Start, it)} e il {D(range.End, it)}: i dati vanno dal {D(first, it)} al {D(last, it)}."
                : $"I have no sales between {D(range.Start, it)} and {D(range.End, it)}: the data goes from {D(first, it)} to {D(last, it)}.";
        }

        var best = inRange.MaxBy(s => s.Quantity)!;
        var worst = inRange.MinBy(s => s.Quantity)!;
        var fromText = D(inRange[0].Date, it);
        var toText = D(inRange[^1].Date, it);

        return it
            ? $"Dal {fromText} al {toText} il giorno migliore è stato {D(best.Date, it)} ({NumberText.Weekday(best.Date.DayOfWeek, it)}) con {Qty(best.Quantity, it)} unità; il peggiore {D(worst.Date, it)} ({NumberText.Weekday(worst.Date.DayOfWeek, it)}) con {Qty(worst.Quantity, it)}."
            : $"From {fromText} to {toText} the best day was {D(best.Date, it)} ({NumberText.Weekday(best.Date.DayOfWeek, it)}) with {Qty(best.Quantity, it)} units; the worst was {D(worst.Date, it)} ({NumberText.Weekday(worst.Date.DayOfWeek, it)}) with {Qty(worst.Quantity, it)}.";
    }

    // ------------------------------------------------------------------ previsione

    private static string ForecastTotal(string normalized, AskContext context, bool it)
    {
        var forecast = context.Forecast;
        if (forecast is null || forecast.Forecast.Count == 0)
        {
            return NoForecast(it);
        }

        var points = forecast.Forecast.OrderBy(p => p.Date).ToList();
        var requested = PeriodParser.ParseFutureDays(normalized);
        var count = requested.HasValue ? Math.Min(requested.Value, points.Count) : points.Count;
        var used = points.Take(count).ToList();
        var total = used.Sum(p => p.Yhat);
        var average = total / used.Count;
        var days = NumberText.Days(used.Count, it);

        var text = it
            ? $"Per i prossimi {days} (dal {D(used[0].Date, it)} al {D(used[^1].Date, it)}) prevedo circa {Qty(total, it)} unità, {Qty(average, it)} al giorno."
            : $"For the next {days} (from {D(used[0].Date, it)} to {D(used[^1].Date, it)}) I forecast about {Qty(total, it)} units, {Qty(average, it)} per day.";

        if (requested.HasValue && requested.Value > points.Count)
        {
            var covered = NumberText.Days(points.Count, it);
            text += it
                ? $" Il forecast copre solo {covered}: per andare oltre ricalcolalo con un orizzonte più lungo."
                : $" The forecast only covers {covered}: recompute it with a longer horizon to go further.";
        }

        return text + ZeroWarning(context, it);
    }

    private static string ReorderText(AskContext context, bool it)
    {
        var forecast = context.Forecast;
        if (forecast is null || forecast.Forecast.Count == 0)
        {
            return NoForecast(it);
        }

        var outcome = ReorderCalculator.Calculate(forecast, 7, 7, 95, null, context.ZeroDaysPercent);
        var s = outcome.Suggestion;
        if (s is null)
        {
            return it
                ? outcome.Error ?? "Non riesco a calcolare il riordino con questo forecast."
                : "The forecast is too short to cover the reorder period: recompute it with a longer horizon (at least 14 days).";
        }

        var text = it
            ? $"Per coprire i prossimi {s.PeriodDays} giorni ({s.LeadTimeDays} di consegna e {s.ReviewDays} tra un ordine e l'altro) con un livello di servizio del {s.ServiceLevelPercent}%: domanda prevista {Qty(s.DemandInPeriod, it)}, scorta di sicurezza {Qty(s.SafetyStock, it)}, quindi serve un livello massimo di circa {Qty(s.OrderUpToLevel, it)} unità tra magazzino e ordini. Nel riquadro Riordino puoi indicare i tuoi tempi e la scorta attuale."
            : $"To cover the next {s.PeriodDays} days ({s.LeadTimeDays} of delivery and {s.ReviewDays} between orders) at a {s.ServiceLevelPercent}% service level: expected demand {Qty(s.DemandInPeriod, it)}, safety stock {Qty(s.SafetyStock, it)}, so you need a maximum level of about {Qty(s.OrderUpToLevel, it)} units between stock and orders. In the Reorder box you can enter your own lead times and current stock.";

        return text + ZeroWarning(context, it);
    }

    private static string ReliabilityText(List<SalePointDto> sales, AskContext context, bool it)
    {
        var forecast = context.Forecast;
        if (forecast is null || forecast.Forecast.Count == 0)
        {
            return NoForecast(it);
        }

        var facts = FactsBuilder.Build(context.ProductName, sales, forecast);
        var method = MethodLabel(facts.MethodUsed, it);
        var parts = new List<string>
        {
            it ? $"Il metodo usato è {method}." : $"The method used is {method}."
        };

        if (facts.MaeUsed is double mae)
        {
            double? share = facts.ForecastAvgPerDay > 0 ? mae / facts.ForecastAvgPerDay * 100.0 : null;
            var shareText = share.HasValue
                ? (it ? $", circa il {NumberText.Pct(share.Value, it)}% delle vendite previste" : $", about {NumberText.Pct(share.Value, it)}% of the forecast sales")
                : "";
            parts.Add(it
                ? $"Nei giorni di verifica ha sbagliato in media di {Qty(mae, it)} unità al giorno{shareText}."
                : $"On the check days it was off by {Qty(mae, it)} units per day on average{shareText}.");
        }

        if (facts.IntervalHalfWidthPercent is double width)
        {
            parts.Add(it
                ? $"La fascia probabile è di circa ±{NumberText.Pct(width, it)}%."
                : $"The likely range is about ±{NumberText.Pct(width, it)}%.");
        }

        if (facts.ImprovementVsNaivePercent is double improvement)
        {
            if (improvement > 0)
            {
                parts.Add(it
                    ? $"È il {NumberText.Pct(improvement, it)}% in meno del metodo semplice di confronto (naive)."
                    : $"That is {NumberText.Pct(improvement, it)}% less than the simple benchmark method (naive).");
            }
            else
            {
                parts.Add(it
                    ? "Non fa meglio del metodo semplice di confronto (naive): usa la previsione con cautela."
                    : "It does no better than the simple benchmark method (naive): treat the forecast with caution.");
            }
        }

        return string.Join(" ", parts) + ZeroWarning(context, it);
    }

    private static string SummaryText(List<SalePointDto> sales, AskContext context, string language)
    {
        var it = language != ExplanationLanguage.English;
        var forecast = context.Forecast;
        if (forecast is null || forecast.Forecast.Count == 0)
        {
            return NoForecast(it);
        }

        return TemplateExplainer.Explain(FactsBuilder.Build(context.ProductName, sales, forecast), language);
    }

    // ------------------------------------------------------------------ testi comuni

    private static string UnknownText(bool it) => it
        ? "Non ho capito la domanda. Posso rispondere su: vendite in un periodo, confronto con il periodo precedente, giorno più forte della settimana, giorno migliore e peggiore, previsione dei prossimi giorni, quanto ordinare e affidabilità della previsione. Per esempio: «Quanto ho venduto negli ultimi 30 giorni?»"
        : "I did not understand the question. I can answer about: sales in a period, comparison with the previous period, strongest day of the week, best and worst day, forecast for the coming days, how much to order and how reliable the forecast is. For example: \"How much did I sell in the last 30 days?\"";

    private static string NoForecast(bool it) => it
        ? "Per questo prodotto non c'è ancora un forecast: calcolalo nella sezione Previsione e poi chiedimi pure."
        : "There is no forecast for this product yet: compute it in the Forecast section and then ask away.";

    private static string ZeroWarning(AskContext context, bool it)
    {
        if (context.ZeroDaysPercent < ReorderCalculator.IntermittentThresholdPercent)
        {
            return "";
        }

        return it
            ? " Attenzione: molti giorni a zero nello storico, quindi la previsione è poco affidabile."
            : " Careful: many days with zero sales in the history, so the forecast is not very reliable.";
    }

    private static string PeriodLabel(PeriodRange range, List<SalePointDto> inRange, bool it)
    {
        if (range.Kind == PeriodKind.CalendarMonth)
        {
            var month = NumberText.Month(range.Month, it);
            return it ? $"A {month} {range.Year}" : $"In {month} {range.Year}";
        }

        var fromText = D(inRange[0].Date, it);
        var toText = D(inRange[^1].Date, it);
        return it ? $"Dal {fromText} al {toText}" : $"From {fromText} to {toText}";
    }

    private static string MethodLabel(string method, bool it) =>
        method == "blend" ? (it ? "la media di ETS e LightGBM" : "the average of ETS and LightGBM") : method;

    private static string Qty(double value, bool it) => NumberText.Qty(value, it);

    private static string D(DateOnly date, bool it) => NumberText.Date(date, it);
}
