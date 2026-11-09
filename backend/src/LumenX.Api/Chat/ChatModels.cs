using LumenX.Api.Contracts;

namespace LumenX.Api.Chat;

/// <summary>Le domande che il codice sa risolvere. Tutto il resto e' <see cref="Unknown"/>.</summary>
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
    /// <summary>Il codice che esce dall'API (stabile, in minuscolo con il trattino basso).</summary>
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

/// <summary>Corpo di POST /products/{id}/ask. La lingua e' facoltativa: se manca la si riconosce dalla domanda.</summary>
public sealed record AskRequest(string? Question, string? Language);

public sealed record AskResponse(
    string Question,
    string Language,
    string Intent,
    bool Understood,
    string Answer,
    IReadOnlyList<string> Suggestions);

/// <summary>Tutto cio' che serve per rispondere: lo storico, l'ultimo forecast (se c'e') e la quota di giorni a zero.</summary>
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
