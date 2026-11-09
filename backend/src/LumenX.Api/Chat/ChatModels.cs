using LumenX.Api.Contracts;

namespace LumenX.Api.Chat;

/// <summary>The questions the code knows how to solve. Everything else is <see cref="Unknown"/>.</summary>
public enum DataIntent
{
    Unknown,
    SalesTotal,
    ComparePeriods,
    WeekdayPattern,
    PeakDay,
    ForecastTotal,
    Reorder,
    Reliability,
    Summary
}

public static class DataIntentExtensions
{
    /// <summary>The code returned by the API (stable, lowercase with underscores).</summary>
    public static string ToCode(this DataIntent intent) => intent switch
    {
        DataIntent.SalesTotal => "sales_total",
        DataIntent.ComparePeriods => "compare_periods",
        DataIntent.WeekdayPattern => "weekday_pattern",
        DataIntent.PeakDay => "peak_day",
        DataIntent.ForecastTotal => "forecast_total",
        DataIntent.Reorder => "reorder",
        DataIntent.Reliability => "reliability",
        DataIntent.Summary => "summary",
        _ => "unknown"
    };
}

/// <summary>Body of POST /products/{id}/ask. The language is optional: if missing, it is detected from the question.</summary>
public sealed record AskRequest(string? Question, string? Language);

public sealed record AskResponse(
    string Question,
    string Language,
    string Intent,
    bool Understood,
    string Answer,
    IReadOnlyList<string> Suggestions);

/// <summary>Everything needed to answer: the history, the latest forecast (if any) and the share of zero-sales days.</summary>
public sealed record AskContext(
    string ProductName,
    IReadOnlyList<SalePointDto> Sales,
    ForecastRunDto? Forecast,
    double ZeroDaysPercent);

public sealed record AskAnswer(
    DataIntent Intent,
    string Text,
    bool Understood,
    IReadOnlyList<string> Suggestions);
