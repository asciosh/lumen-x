using LumenX.Api.Contracts;
using LumenX.Api.Forecasting;

namespace LumenX.Api.Explanations;

public static class FactsBuilder
{
    public static ExplanationFacts Build(string productName, IReadOnlyList<SalePointDto> sales, ForecastRunDto run)
    {
        if (sales.Count == 0)
        {
            throw new ArgumentException("Servono delle vendite.", nameof(sales));
        }
        if (run.Forecast.Count == 0)
        {
            throw new ArgumentException("Il forecast e' vuoto.", nameof(run));
        }

        var history = sales.OrderBy(s => s.Date).ToList();
        var points = run.Forecast.OrderBy(p => p.Date).ToList();
        var horizon = points.Count;

        var forecastTotal = points.Sum(p => p.Yhat);
        var forecastAvg = forecastTotal / horizon;

        // Confronto con lo storico recente: stessa lunghezza dell'orizzonte (al massimo tutto lo storico).
        var referenceDays = Math.Min(horizon, history.Count);
        var referenceAvg = history.Skip(history.Count - referenceDays).Average(s => s.Quantity);
        double? change = referenceAvg > 0 ? (forecastAvg - referenceAvg) / referenceAvg * 100.0 : null;

        // Giorno della settimana piu' forte / piu' debole (solo con almeno una settimana di previsione
        // e se la differenza e' significativa, altrimenti sarebbe rumore).
        string? strongest = null;
        string? weakest = null;
        double? strongestAvg = null;
        double? weakestAvg = null;
        if (horizon >= 7 && forecastAvg > 0)
        {
            var byDay = points
                .GroupBy(p => p.Date.DayOfWeek)
                .Select(g => new { Day = g.Key, Avg = g.Average(p => p.Yhat) })
                .ToList();
            var top = byDay.OrderByDescending(x => x.Avg).ThenBy(x => x.Day).First();
            var bottom = byDay.OrderBy(x => x.Avg).ThenBy(x => x.Day).First();
            if (top.Day != bottom.Day && (top.Avg - bottom.Avg) / forecastAvg > 0.05)
            {
                strongest = top.Day.ToString();
                strongestAvg = top.Avg;
                weakest = bottom.Day.ToString();
                weakestAvg = bottom.Avg;
            }
        }

        double? halfWidth = forecastAvg > 0
            ? points.Average(p => (p.Upper - p.Lower) / 2.0) / forecastAvg * 100.0
            : null;

        var maeUsed = MaeOf(run.Backtest, run.MethodUsed);
        var maeNaive = MaeOf(run.Backtest, "naive");
        double? improvement = null;
        var usedIsNaive = string.Equals(run.MethodUsed, "naive", StringComparison.OrdinalIgnoreCase);
        if (!usedIsNaive && maeUsed is double used && maeNaive is double naive && naive > 0)
        {
            improvement = (naive - used) / naive * 100.0;
        }

        var zeroDaysPercent = history.Count(s => s.Quantity == 0) * 100.0 / history.Count;

        var name = productName.Length > 100 ? productName[..100] : productName;

        return new ExplanationFacts(
            ProductName: name,
            HistoryDays: history.Count,
            HistoryEnd: history[^1].Date,
            MethodUsed: run.MethodUsed,
            Horizon: horizon,
            ForecastStart: points[0].Date,
            ForecastEnd: points[^1].Date,
            ForecastTotal: forecastTotal,
            ForecastAvgPerDay: forecastAvg,
            ReferenceDays: referenceDays,
            ReferenceAvgPerDay: referenceAvg,
            ChangePercent: change,
            StrongestWeekday: strongest,
            StrongestWeekdayAvg: strongestAvg,
            WeakestWeekday: weakest,
            WeakestWeekdayAvg: weakestAvg,
            IntervalHalfWidthPercent: halfWidth,
            HoldoutDays: run.HoldoutDays,
            MaeUsed: maeUsed,
            MaeNaive: maeNaive,
            ImprovementVsNaivePercent: improvement,
            FilledMissingDays: run.FilledMissingDays,
            ZeroDaysPercent: zeroDaysPercent);
    }

    private static double? MaeOf(Dictionary<string, BacktestMetrics>? backtest, string method)
    {
        if (backtest is null) return null;
        foreach (var kv in backtest)
        {
            if (string.Equals(kv.Key, method, StringComparison.OrdinalIgnoreCase))
            {
                return kv.Value.Mae;
            }
        }
        return null;
    }
}
