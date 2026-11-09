namespace LumenX.Api.Reorder;

/// <summary>Reorder suggestion computed from the saved forecast and its backtest error.</summary>
public sealed record ReorderSuggestion(
    int ForecastRunId,
    string MethodUsed,
    int LeadTimeDays,
    int ReviewDays,
    int PeriodDays,
    int ServiceLevelPercent,
    double ZValue,
    double DemandInPeriod,
    double DailyErrorStdDev,
    double SafetyStock,
    double OrderUpToLevel,
    double? OnHand,
    double? SuggestedOrder,
    IReadOnlyList<string> Warnings);

/// <summary>Outcome of the calculation: the suggestion or a message for the user (never both).</summary>
public sealed record ReorderOutcome(ReorderSuggestion? Suggestion, string? Error)
{
    public static ReorderOutcome Ok(ReorderSuggestion suggestion) => new(suggestion, null);

    public static ReorderOutcome Fail(string error) => new(null, error);
}
