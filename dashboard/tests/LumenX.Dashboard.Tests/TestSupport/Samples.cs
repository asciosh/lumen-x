using LumenX.Dashboard.Services;

namespace LumenX.Dashboard.Tests.TestSupport;

/// <summary>Sample data for tests: same format as the backend responses.</summary>
public static class Samples
{
    public static readonly DateTime Now = new(2026, 11, 6, 10, 30, 0, DateTimeKind.Utc);
    public static readonly DateOnly FirstDay = new(2025, 1, 1);

    public static ProductDto Product(int id = 5, string name = "Pane", string? sku = "P-1") =>
        new(id, name, sku, Now);

    /// <summary>Daily history starting on 1 January 2025, with a small weekly pattern.</summary>
    public static List<SalePointDto> Sales(int days)
    {
        return Enumerable.Range(0, days)
            .Select(i => new SalePointDto(FirstDay.AddDays(i), 100 + (i % 7) * 10))
            .ToList();
    }

    /// <summary>Forecast that starts the day after the first 60 days of <see cref="Sales"/>.</summary>
    public static ForecastRunDto Forecast(int horizon = 28, string method = "blend")
    {
        var last = FirstDay.AddDays(59);
        var points = Enumerable.Range(1, horizon)
            .Select(i => new ForecastPointView(last.AddDays(i), 120 + (i % 7) * 10, 100 + (i % 7) * 10, 140 + (i % 7) * 10))
            .ToList();

        var backtest = new Dictionary<string, BacktestMetricsDto>
        {
            ["naive"] = new BacktestMetricsDto(10.5, 13.4),
            ["ets"] = new BacktestMetricsDto(9.5, 11.1),
            ["lightgbm"] = new BacktestMetricsDto(8.3, 11.0),
            ["blend"] = new BacktestMetricsDto(8.0, 10.6)
        };

        return new ForecastRunDto(1, 5, Now, "auto", method, horizon, 28, 0, null, backtest, points);
    }
}
