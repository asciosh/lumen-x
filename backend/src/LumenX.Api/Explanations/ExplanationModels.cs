namespace LumenX.Api.Explanations;

/// <summary>
/// Fatti calcolati dal codice (non dall'AI) a partire da vendite e forecast.
/// Sono l'unica cosa che viene passata a un eventuale LLM.
/// </summary>
public sealed record ExplanationFacts(
    string ProductName,
    int HistoryDays,
    DateOnly HistoryEnd,
    string MethodUsed,
    int Horizon,
    DateOnly ForecastStart,
    DateOnly ForecastEnd,
    double ForecastTotal,
    double ForecastAvgPerDay,
    int ReferenceDays,
    double ReferenceAvgPerDay,
    double? ChangePercent,
    string? StrongestWeekday,
    double? StrongestWeekdayAvg,
    string? WeakestWeekday,
    double? WeakestWeekdayAvg,
    double? IntervalHalfWidthPercent,
    int HoldoutDays,
    double? MaeUsed,
    double? MaeNaive,
    double? ImprovementVsNaivePercent,
    int FilledMissingDays,
    double ZeroDaysPercent = 0);

/// <summary>Testo finale. Source: "template" o "gemini". Note: null, "ai_not_configured", "ai_unavailable" o "ai_rejected".</summary>
public sealed record ExplanationResult(string Text, string Source, string? Note = null);

public sealed record ExplanationDto(
    int ForecastRunId,
    string Language,
    string Text,
    string Source,
    string? Note,
    ExplanationFacts Facts);

public static class ExplanationLanguage
{
    public const string Italian = "it";
    public const string English = "en";

    /// <summary>Vuoto = italiano. Restituisce null se la lingua non e' supportata.</summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return Italian;
        var v = value.Trim().ToLowerInvariant();
        return v == Italian || v == English ? v : null;
    }
}

public interface IExplainer
{
    Task<ExplanationResult> ExplainAsync(
        ExplanationFacts facts, string language, CancellationToken cancellationToken = default);
}

/// <summary>Il provider AI non ha prodotto un testo utilizzabile (rete, limiti, risposta vuota...).</summary>
public sealed class ExplanationUnavailableException : Exception
{
    public ExplanationUnavailableException(string message, Exception? inner = null, string note = "ai_unavailable")
        : base(message, inner)
    {
        Note = note;
    }

    /// <summary>Codice mostrato in dashboard: "ai_unavailable" (errore, limiti) o "ai_rejected" (numeri non verificabili).</summary>
    public string Note { get; }
}
