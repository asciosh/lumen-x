using LumenX.Api.Contracts;
using LumenX.Api.Explanations;
using LumenX.Api.Forecasting;

namespace LumenX.Api.Tests;

public class FactsBuilderTests
{
    private static List<SalePointDto> Sales(int days, double quantity)
    {
        var start = new DateOnly(2025, 1, 1);
        return Enumerable.Range(0, days).Select(i => new SalePointDto(start.AddDays(i), quantity)).ToList();
    }

    private static ForecastRunDto Run(
        List<ForecastPointView> points,
        string method = "ets",
        Dictionary<string, BacktestMetrics>? backtest = null) =>
        new(1, 1, DateTime.UtcNow, null, method, points.Count, 14, 2, null, backtest, points);

    // 2025-03-01 e' un sabato.
    private static List<ForecastPointView> Points(int days, Func<DateOnly, double> yhat) =>
        Enumerable.Range(0, days)
            .Select(i =>
            {
                var d = new DateOnly(2025, 3, 1).AddDays(i);
                var y = yhat(d);
                return new ForecastPointView(d, y, y - 10, y + 10);
            })
            .ToList();

    [Fact]
    public void Change_percent_compares_forecast_with_recent_history()
    {
        var run = Run(Points(28, _ => 120.0));

        var facts = FactsBuilder.Build("Caffè", Sales(60, 100.0), run);

        Assert.Equal(28, facts.Horizon);
        Assert.Equal(120.0 * 28, facts.ForecastTotal, 6);
        Assert.Equal(28, facts.ReferenceDays);
        Assert.Equal(100.0, facts.ReferenceAvgPerDay, 6);
        Assert.NotNull(facts.ChangePercent);
        Assert.Equal(20.0, facts.ChangePercent!.Value, 6);
        Assert.Equal(2, facts.FilledMissingDays);
    }

    [Fact]
    public void Strongest_weekday_is_found_when_difference_is_significant()
    {
        var run = Run(Points(14, d => d.DayOfWeek == DayOfWeek.Saturday ? 200.0 : 100.0));

        var facts = FactsBuilder.Build("Caffè", Sales(60, 100.0), run);

        Assert.Equal("Saturday", facts.StrongestWeekday);
        Assert.Equal(200.0, facts.StrongestWeekdayAvg!.Value, 6);
        Assert.Equal(100.0, facts.WeakestWeekdayAvg!.Value, 6);
    }

    [Fact]
    public void Weekday_is_omitted_when_horizon_is_shorter_than_a_week()
    {
        var run = Run(Points(5, d => d.DayOfWeek == DayOfWeek.Saturday ? 200.0 : 100.0));

        var facts = FactsBuilder.Build("Caffè", Sales(60, 100.0), run);

        Assert.Null(facts.StrongestWeekday);
        Assert.Null(facts.WeakestWeekday);
    }

    [Fact]
    public void Weekday_is_omitted_when_the_forecast_is_flat()
    {
        var run = Run(Points(28, _ => 100.0));

        var facts = FactsBuilder.Build("Caffè", Sales(60, 100.0), run);

        Assert.Null(facts.StrongestWeekday);
    }

    [Fact]
    public void Improvement_over_naive_is_computed_from_backtest_mae()
    {
        var backtest = new Dictionary<string, BacktestMetrics>
        {
            ["naive"] = new BacktestMetrics { Mae = 5.0, Rmse = 6.5 },
            ["ets"] = new BacktestMetrics { Mae = 3.0, Rmse = 4.0 }
        };
        var run = Run(Points(28, _ => 100.0), "ets", backtest);

        var facts = FactsBuilder.Build("Caffè", Sales(60, 100.0), run);

        Assert.Equal(3.0, facts.MaeUsed!.Value, 6);
        Assert.Equal(5.0, facts.MaeNaive!.Value, 6);
        Assert.Equal(40.0, facts.ImprovementVsNaivePercent!.Value, 6);
    }

    [Fact]
    public void No_improvement_is_reported_when_naive_was_used()
    {
        var backtest = new Dictionary<string, BacktestMetrics>
        {
            ["naive"] = new BacktestMetrics { Mae = 5.0, Rmse = 6.5 }
        };
        var run = Run(Points(28, _ => 100.0), "naive", backtest);

        var facts = FactsBuilder.Build("Caffè", Sales(60, 100.0), run);

        Assert.Null(facts.ImprovementVsNaivePercent);
    }

    [Fact]
    public void Zero_recent_sales_give_no_change_percent()
    {
        var run = Run(Points(28, _ => 50.0));

        var facts = FactsBuilder.Build("Caffè", Sales(60, 0.0), run);

        Assert.Null(facts.ChangePercent);
    }

    [Fact]
    public void Zero_days_percent_counts_days_without_sales()
    {
        var start = new DateOnly(2025, 1, 1);
        var sales = Enumerable.Range(0, 60)
            .Select(i => new SalePointDto(start.AddDays(i), i < 15 ? 0.0 : 100.0))
            .ToList();
        var run = Run(Points(28, _ => 100.0));

        var facts = FactsBuilder.Build("Libri", sales, run);

        Assert.Equal(25.0, facts.ZeroDaysPercent, 6);
    }

    [Fact]
    public void Zero_days_percent_is_zero_when_every_day_has_sales()
    {
        var facts = FactsBuilder.Build("Pane", Sales(60, 100.0), Run(Points(28, _ => 100.0)));

        Assert.Equal(0.0, facts.ZeroDaysPercent, 6);
    }
}
