using LumenX.Api.Contracts;

namespace LumenX.Api.Reorder;

/// <summary>
/// Periodic-review reorder level ("order-up-to"):
///
///   period P            = lead time days + days between orders
///   demand in period    = sum of the forecasts of the first P days
///   safety stock        = z * daily error (backtest RMSE) * square root of P
///   maximum level       = demand in period + safety stock
///   suggested order     = maximum level - current stock (never negative, rounded up)
///
/// Declared limit: the square root of P assumes errors are independent from one day to the next. If the level
/// of sales changes suddenly, the error weighs on all days together and the safety stock turns out a bit low.
/// </summary>
public static class ReorderCalculator
{
    public const int MaxDays = 60;

    /// <summary>Above this percentage of zero-sales days the series is intermittent and the calculation is not reliable.</summary>
    public const double IntermittentThresholdPercent = 20;

    // Standard normal values (one-sided quantile) for the allowed service levels.
    private static readonly Dictionary<int, double> ZByServiceLevel = new()
    {
        [90] = 1.2816,
        [95] = 1.6449,
        [98] = 2.0537,
        [99] = 2.3263
    };

    // The forecasting service computes the 80% band as yhat +- 1.2816 x RMSE.
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
            return ReorderOutcome.Fail($"Lead time must be between 1 and {MaxDays} days.");
        }
        if (reviewDays < 0 || reviewDays > MaxDays)
        {
            return ReorderOutcome.Fail($"Review days must be between 0 and {MaxDays}.");
        }
        if (!ZByServiceLevel.TryGetValue(serviceLevelPercent, out var z))
        {
            return ReorderOutcome.Fail("The service level must be 90, 95, 98 or 99.");
        }
        if (onHand.HasValue && (double.IsNaN(onHand.Value) || double.IsInfinity(onHand.Value) || onHand.Value < 0))
        {
            return ReorderOutcome.Fail("Current stock must be a number greater than or equal to zero.");
        }

        var points = run.Forecast.OrderBy(p => p.Date).ToList();
        var period = leadTimeDays + reviewDays;
        if (period > points.Count)
        {
            return ReorderOutcome.Fail(
                $"The period to cover ({period} days) exceeds the forecast horizon ({points.Count} days): " +
                $"recompute the forecast with a horizon of at least {period} days.");
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

    /// <summary>Backtest RMSE of the method used; if missing, derived from the forecast's 80% band.</summary>
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
