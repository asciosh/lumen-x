using System.Text.Json;

namespace LumenX.Dashboard.Services;

// DTOs mirroring the backend's JSON responses (camelCase, dates yyyy-MM-dd).

public sealed record ProductDto(int Id, string Name, string? Sku, DateTime CreatedAtUtc);

public sealed record SalePointDto(DateOnly Date, double Quantity);

public sealed record RowErrorDto(int Line, string Message);

public sealed record ImportResultDto(
    int TotalRows,
    int ValidRows,
    int Inserted,
    int Updated,
    int DuplicatesInFile,
    int Rejected,
    List<RowErrorDto> Errors,
    bool ErrorsTruncated);

public sealed record BacktestMetricsDto(double? Mae, double? Rmse);

public sealed record ForecastPointView(DateOnly Date, double Yhat, double Lower, double Upper);

public sealed record ForecastRunDto(
    int Id,
    int ProductId,
    DateTime CreatedAtUtc,
    string? MethodRequested,
    string MethodUsed,
    int Horizon,
    int HoldoutDays,
    int FilledMissingDays,
    JsonElement? Interval,
    Dictionary<string, BacktestMetricsDto>? Backtest,
    List<ForecastPointView> Forecast);

public sealed record ExplanationDto(int ForecastRunId, string Language, string Text, string Source, string? Note);

public sealed record ReorderSuggestionDto(
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
    List<string> Warnings);

public sealed record AskResponseDto(
    string Question,
    string Language,
    string Intent,
    bool Understood,
    string Answer,
    List<string> Suggestions);

// Body di POST /products e POST /products/{id}/forecast
public sealed record CreateProductRequest(string Name, string? Sku);
public sealed record ForecastRequest(int? Horizon, string? Method);
public sealed record AskRequest(string Question, string? Language);
