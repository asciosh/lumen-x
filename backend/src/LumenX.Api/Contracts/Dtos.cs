using System.Text.Json;
using LumenX.Api.Forecasting;

namespace LumenX.Api.Contracts;

// ---- Prodotti ----
public sealed record CreateProductRequest(string? Name, string? Sku);
public sealed record ProductDto(int Id, string Name, string? Sku, DateTime CreatedAtUtc);

// ---- Vendite ----
public sealed record SalePointDto(DateOnly Date, double Quantity);
public sealed record RowErrorDto(int Line, string Message);

public sealed record ImportResultDto(
    int TotalRows,
    int ValidRows,
    int Inserted,
    int Updated,
    int DuplicatesInFile,
    int Rejected,
    IReadOnlyList<RowErrorDto> Errors,
    bool ErrorsTruncated);

// ---- Forecast ----
public sealed record ForecastRequestDto(int? Horizon, string? Method);
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
    Dictionary<string, BacktestMetrics>? Backtest,
    IReadOnlyList<ForecastPointView> Forecast);
