using Bunit;
using LumenX.Dashboard.Components;
using LumenX.Dashboard.Services;
using LumenX.Dashboard.Tests.TestSupport;
using Microsoft.Extensions.DependencyInjection;

namespace LumenX.Dashboard.Tests;

public class ForecastChartTests : BunitContext
{
    public ForecastChartTests()
    {
        // Italian, like the other tests (the legend and the axis labels are checked in Italian).
        Services.AddSingleton(new LanguageState(LanguageState.Italian));
    }

    private IRenderedComponent<ForecastChart> RenderChart(
        IReadOnlyList<SalePointDto>? history, ForecastRunDto? forecast) =>
        Render<ForecastChart>(p => p
            .Add(c => c.History, history)
            .Add(c => c.Forecast, forecast));

    [Fact]
    public void Draws_history_forecast_and_interval_band()
    {
        var cut = RenderChart(Samples.Sales(60), Samples.Forecast());

        Assert.Equal(2, cut.FindAll("polyline").Count);   // history and forecast
        Assert.Single(cut.FindAll("polygon"));             // banda dell'intervallo
        Assert.Single(cut.FindAll("svg.chart"));
    }

    [Fact]
    public void Markup_never_contains_nan_or_infinity()
    {
        var cut = RenderChart(Samples.Sales(60), Samples.Forecast());

        Assert.DoesNotContain("NaN", cut.Markup);
        Assert.DoesNotContain("Infinity", cut.Markup);
    }

    [Fact]
    public void Numbers_in_the_drawing_use_the_dot_as_decimal_separator()
    {
        var cut = RenderChart(Samples.Sales(60), Samples.Forecast());

        var points = cut.Find("polyline.line-yhat").GetAttribute("points")!;

        Assert.DoesNotContain(",,", points);
        Assert.All(points.Split(' '), pair => Assert.Equal(2, pair.Split(',').Length));
    }

    [Fact]
    public void Last_date_label_is_anchored_to_the_end_so_it_is_not_cut_off()
    {
        var cut = RenderChart(Samples.Sales(60), Samples.Forecast());

        var dateLabels = cut.FindAll("text.tick").Where(t => t.TextContent.Contains('/')).ToList();

        Assert.Equal(5, dateLabels.Count);
        Assert.Equal("start", dateLabels.First().GetAttribute("text-anchor"));
        Assert.Equal("end", dateLabels.Last().GetAttribute("text-anchor"));
    }

    [Fact]
    public void Only_the_most_recent_days_of_history_are_drawn()
    {
        var cut = RenderChart(Samples.Sales(300), null);

        var points = cut.Find("polyline.line-history").GetAttribute("points")!.Split(' ');

        Assert.Equal(120, points.Length);
    }

    [Fact]
    public void History_without_forecast_draws_only_the_history()
    {
        var cut = RenderChart(Samples.Sales(30), null);

        Assert.Single(cut.FindAll("polyline"));
        Assert.Empty(cut.FindAll("polygon"));
    }

    [Fact]
    public void Nothing_to_show_says_so()
    {
        var cut = RenderChart(new List<SalePointDto>(), null);

        Assert.Contains("Nessun dato da mostrare", cut.Markup);
        Assert.Empty(cut.FindAll("svg"));
    }

    [Fact]
    public void Legend_names_the_three_elements()
    {
        var cut = RenderChart(Samples.Sales(60), Samples.Forecast());

        var legend = cut.Find(".legend").TextContent;

        Assert.Contains("Storico", legend);
        Assert.Contains("Previsione", legend);
        Assert.Contains("Fascia probabile", legend);
    }
}
