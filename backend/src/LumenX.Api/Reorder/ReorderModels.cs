namespace LumenX.Api.Reorder;

/// <summary>Suggerimento di riordino calcolato dal forecast salvato e dal suo errore di backtest.</summary>
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

/// <summary>Esito del calcolo: il suggerimento oppure un messaggio per l'utente (mai entrambi).</summary>
public sealed record ReorderOutcome(ReorderSuggestion? Suggestion, string? Error)
{
    public static ReorderOutcome Ok(ReorderSuggestion suggestion) => new(suggestion, null);

    public static ReorderOutcome Fail(string error) => new(null, error);
}
