using LumenX.Api.Contracts;
using LumenX.Api.Forecasting;
using LumenX.Api.Reorder;

namespace LumenX.Api.Tests;

public class ReorderCalculatorTests
{
    private static List<ForecastPointView> Points(int days, Func<int, double> yhat, double halfWidth = 10)
    {
        var start = new DateOnly(2025, 4, 1);
        return Enumerable.Range(0, days)
            .Select(i => new ForecastPointView(start.AddDays(i), yhat(i), yhat(i) - halfWidth, yhat(i) + halfWidth))
            .ToList();
    }

    private static ForecastRunDto Run(List<ForecastPointView> points, double? rmse = 20.0, string method = "blend")
    {
        var backtest = rmse.HasValue
            ? new Dictionary<string, BacktestMetrics> { [method] = new BacktestMetrics { Mae = 15.0, Rmse = rmse.Value } }
            : null;
        return new ForecastRunDto(7, 1, DateTime.UtcNow, null, method, points.Count, 14, 0, null, backtest, points);
    }

    private static ReorderSuggestion Ok(ReorderOutcome outcome)
    {
        Assert.Null(outcome.Error);
        Assert.NotNull(outcome.Suggestion);
        return outcome.Suggestion!;
    }

    [Fact]
    public void Values_match_a_hand_calculation()
    {
        // domanda 14 x 100 = 1400; sicurezza 1,6449 x 20 x radice(14) = 123,09
        var run = Run(Points(14, _ => 100.0));

        var s = Ok(ReorderCalculator.Calculate(run, 7, 7, 95, 300, 0));

        Assert.Equal(14, s.PeriodDays);
        Assert.Equal(1400.0, s.DemandInPeriod, 6);
        Assert.Equal(20.0, s.DailyErrorStdDev, 6);
        Assert.Equal(1.6449, s.ZValue, 6);
        Assert.Equal(123.09, s.SafetyStock, 2);
        Assert.Equal(1523.09, s.OrderUpToLevel, 2);
        Assert.Equal(1224.0, s.SuggestedOrder!.Value, 6);   // 1523.09 - 300 rounded up
        Assert.Equal(7, s.ForecastRunId);
        Assert.Equal("blend", s.MethodUsed);
    }

    [Fact]
    public void Only_the_first_days_of_the_period_are_summed()
    {
        var run = Run(Points(28, i => i < 14 ? 100.0 : 1000.0));

        var s = Ok(ReorderCalculator.Calculate(run, 7, 7, 95, null, 0));

        Assert.Equal(1400.0, s.DemandInPeriod, 6);
    }

    [Fact]
    public void Without_on_hand_there_is_no_suggested_order()
    {
        var s = Ok(ReorderCalculator.Calculate(Run(Points(14, _ => 100.0)), 7, 7, 95, null, 0));

        Assert.Null(s.OnHand);
        Assert.Null(s.SuggestedOrder);
    }

    [Fact]
    public void Enough_stock_means_order_zero()
    {
        var s = Ok(ReorderCalculator.Calculate(Run(Points(14, _ => 100.0)), 7, 7, 95, 5000, 0));

        Assert.Equal(0.0, s.SuggestedOrder!.Value, 6);
    }

    [Fact]
    public void Higher_service_level_needs_more_safety_stock()
    {
        var run = Run(Points(14, _ => 100.0));

        var low = Ok(ReorderCalculator.Calculate(run, 7, 7, 90, null, 0));
        var high = Ok(ReorderCalculator.Calculate(run, 7, 7, 99, null, 0));

        Assert.Equal(95.91, low.SafetyStock, 2);
        Assert.Equal(174.08, high.SafetyStock, 2);
        Assert.True(high.SafetyStock > low.SafetyStock);
    }

    [Fact]
    public void Zero_review_days_covers_only_the_lead_time()
    {
        var s = Ok(ReorderCalculator.Calculate(Run(Points(14, _ => 100.0)), 7, 0, 95, null, 0));

        Assert.Equal(7, s.PeriodDays);
        Assert.Equal(700.0, s.DemandInPeriod, 6);
        Assert.Equal(87.04, s.SafetyStock, 2);
    }

    [Fact]
    public void Error_is_taken_from_the_interval_when_the_backtest_has_no_entry()
    {
        // fascia = yhat +- 12,816 => RMSE = 10; sicurezza = 1,6449 x 10 x radice(14) = 61,55
        var run = Run(Points(14, _ => 100.0, halfWidth: 12.816), rmse: null);

        var s = Ok(ReorderCalculator.Calculate(run, 7, 7, 95, null, 0));

        Assert.Equal(10.0, s.DailyErrorStdDev, 3);
        Assert.Equal(61.55, s.SafetyStock, 2);
    }

    [Fact]
    public void Period_longer_than_the_forecast_horizon_is_an_error()
    {
        var outcome = ReorderCalculator.Calculate(Run(Points(14, _ => 100.0)), 10, 10, 95, null, 0);

        Assert.Null(outcome.Suggestion);
        Assert.Contains("horizon", outcome.Error);
        Assert.Contains("20 days", outcome.Error);
    }

    [Theory]
    [InlineData(0, 7, 95, null)]
    [InlineData(61, 7, 95, null)]
    [InlineData(7, -1, 95, null)]
    [InlineData(7, 61, 95, null)]
    [InlineData(7, 7, 97, null)]
    [InlineData(7, 7, 95, -5.0)]
    public void Invalid_inputs_are_rejected_with_a_message(int lead, int review, int service, double? onHand)
    {
        var outcome = ReorderCalculator.Calculate(Run(Points(90, _ => 100.0)), lead, review, service, onHand, 0);

        Assert.Null(outcome.Suggestion);
        Assert.False(string.IsNullOrWhiteSpace(outcome.Error));
    }

    [Fact]
    public void Many_zero_days_add_an_intermittent_warning()
    {
        var run = Run(Points(14, _ => 100.0));

        Assert.Contains("intermittent", Ok(ReorderCalculator.Calculate(run, 7, 7, 95, null, 25.0)).Warnings);
        Assert.Empty(Ok(ReorderCalculator.Calculate(run, 7, 7, 95, null, 5.0)).Warnings);
    }

    [Fact]
    public void Allowed_service_levels_are_the_documented_ones()
    {
        Assert.Equal(new[] { 90, 95, 98, 99 }, ReorderCalculator.ServiceLevels.OrderBy(x => x).ToArray());
    }
}
