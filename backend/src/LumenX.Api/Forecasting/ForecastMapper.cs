using System.Text.Json;
using LumenX.Api.Contracts;
using LumenX.Api.Domain;

namespace LumenX.Api.Forecasting;

public static class ForecastMapper
{
    public static ForecastRun ToEntity(int productId, string? methodRequested, ForecastingResponse response)
    {
        return new ForecastRun
        {
            ProductId = productId,
            CreatedAtUtc = DateTime.UtcNow,
            MethodRequested = methodRequested,
            MethodUsed = response.MethodUsed,
            Horizon = response.Horizon,
            HoldoutDays = response.HoldoutDays,
            FilledMissingDays = response.FilledMissingDays,
            IntervalJson = response.Interval.HasValue ? response.Interval.Value.GetRawText() : null,
            BacktestJson = response.Backtest is null ? null : JsonSerializer.Serialize(response.Backtest),
            Points = response.Forecast
                .Select(p => new ForecastPoint
                {
                    Date = p.Date,
                    Yhat = p.Yhat,
                    Lower = p.Lower,
                    Upper = p.Upper
                })
                .ToList()
        };
    }

    public static ForecastRunDto ToDto(ForecastRun run)
    {
        JsonElement? interval = null;
        if (!string.IsNullOrWhiteSpace(run.IntervalJson))
        {
            using var doc = JsonDocument.Parse(run.IntervalJson);
            interval = doc.RootElement.Clone();
        }

        Dictionary<string, BacktestMetrics>? backtest = null;
        if (!string.IsNullOrWhiteSpace(run.BacktestJson))
        {
            backtest = JsonSerializer.Deserialize<Dictionary<string, BacktestMetrics>>(run.BacktestJson);
        }

        var points = run.Points
            .OrderBy(p => p.Date)
            .Select(p => new ForecastPointView(p.Date, p.Yhat, p.Lower, p.Upper))
            .ToList();

        return new ForecastRunDto(
            run.Id,
            run.ProductId,
            run.CreatedAtUtc,
            run.MethodRequested,
            run.MethodUsed,
            run.Horizon,
            run.HoldoutDays,
            run.FilledMissingDays,
            interval,
            backtest,
            points);
    }
}
