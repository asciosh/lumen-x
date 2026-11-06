using LumenX.Api.Contracts;

namespace LumenX.Api.Reorder;

/// <summary>
/// Calcolo del livello di riordino a revisione periodica ("order-up-to"):
///
///   periodo P            = giorni di consegna + giorni tra un ordine e l'altro
///   domanda nel periodo  = somma delle previsioni dei primi P giorni
///   scorta di sicurezza  = z * errore giornaliero (RMSE del backtest) * radice di P
///   livello massimo      = domanda nel periodo + scorta di sicurezza
///   ordine suggerito     = livello massimo - scorta attuale (mai negativo, arrotondato per eccesso)
///
/// Limite dichiarato: la radice di P presume errori indipendenti da un giorno all'altro. Se il livello
/// delle vendite cambia di colpo, l'errore pesa su tutti i giorni insieme e la scorta risulta un po' bassa.
/// </summary>
public static class ReorderCalculator
{
    public const int MaxDays = 60;

    /// <summary>Sopra questa percentuale di giorni a zero la serie e' intermittente e il calcolo non e' affidabile.</summary>
    public const double IntermittentThresholdPercent = 20;

    // Valori della normale standard (quantile unilaterale) per i livelli di servizio ammessi.
    private static readonly Dictionary<int, double> ZByServiceLevel = new()
    {
        [90] = 1.2816,
        [95] = 1.6449,
        [98] = 2.0537,
        [99] = 2.3263
    };

    // Il servizio di forecasting calcola la fascia dell'80% come yhat +- 1,2816 x RMSE.
    private const double IntervalZ = 1.2816;

    public static IReadOnlyCollection<int> ServiceLevels => ZByServiceLevel.Keys;

    public static ReorderOutcome Calculate(
        ForecastRunDto run,
        int leadTimeDays,
        int reviewDays,
        int serviceLevelPercent,
        double? onHand,
        double zeroDaysPercent)
    {
        if (leadTimeDays < 1 || leadTimeDays > MaxDays)
        {
            return ReorderOutcome.Fail($"I giorni di consegna devono essere tra 1 e {MaxDays}.");
        }
        if (reviewDays < 0 || reviewDays > MaxDays)
        {
            return ReorderOutcome.Fail($"I giorni tra un ordine e l'altro devono essere tra 0 e {MaxDays}.");
        }
        if (!ZByServiceLevel.TryGetValue(serviceLevelPercent, out var z))
        {
            return ReorderOutcome.Fail("Il livello di servizio deve essere 90, 95, 98 oppure 99.");
        }
        if (onHand.HasValue && (double.IsNaN(onHand.Value) || double.IsInfinity(onHand.Value) || onHand.Value < 0))
        {
            return ReorderOutcome.Fail("La scorta attuale deve essere un numero maggiore o uguale a zero.");
        }

        var points = run.Forecast.OrderBy(p => p.Date).ToList();
        var period = leadTimeDays + reviewDays;
        if (period > points.Count)
        {
            return ReorderOutcome.Fail(
                $"Il periodo da coprire ({period} giorni) supera l'orizzonte del forecast ({points.Count} giorni): " +
                $"ricalcola il forecast con un orizzonte di almeno {period} giorni.");
        }

        var demand = points.Take(period).Sum(p => p.Yhat);
        var sigma = DailyErrorStdDev(run, points);
        var safetyStock = z * sigma * Math.Sqrt(period);
        var orderUpToLevel = demand + safetyStock;
        double? suggested = onHand.HasValue
            ? Math.Ceiling(Math.Max(0, orderUpToLevel - onHand.Value))
            : null;

        var warnings = new List<string>();
        if (zeroDaysPercent >= IntermittentThresholdPercent)
        {
            warnings.Add("intermittent");
        }

        return ReorderOutcome.Ok(new ReorderSuggestion(
            ForecastRunId: run.Id,
            MethodUsed: run.MethodUsed,
            LeadTimeDays: leadTimeDays,
            ReviewDays: reviewDays,
            PeriodDays: period,
            ServiceLevelPercent: serviceLevelPercent,
            ZValue: z,
            DemandInPeriod: demand,
            DailyErrorStdDev: sigma,
            SafetyStock: safetyStock,
            OrderUpToLevel: orderUpToLevel,
            OnHand: onHand,
            SuggestedOrder: suggested,
            Warnings: warnings));
    }

    /// <summary>RMSE del backtest del metodo usato; se manca, lo ricava dalla fascia dell'80% del forecast.</summary>
    private static double DailyErrorStdDev(ForecastRunDto run, List<ForecastPointView> points)
    {
        if (run.Backtest is not null)
        {
            foreach (var kv in run.Backtest)
            {
                if (string.Equals(kv.Key, run.MethodUsed, StringComparison.OrdinalIgnoreCase) && kv.Value.Rmse is double rmse)
                {
                    return rmse;
                }
            }
        }

        return points.Average(p => (p.Upper - p.Lower) / 2.0) / IntervalZ;
    }
}
