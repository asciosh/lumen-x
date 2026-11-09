using System.Text.Json;
using LumenX.Api.Forecasting;

namespace LumenX.Api.Tests;

/// <summary>Replaces the Python service in tests: no network.</summary>
public sealed class FakeForecastingClient : IForecastingClient
{
    public int Calls { get; private set; }
    public ForecastingRequest? LastRequest { get; private set; }

    /// <summary>If set, it is thrown on the next call.</summary>
    public Exception? ExceptionToThrow { get; set; }

    public void Reset()
    {
        Calls = 0;
        LastRequest = null;
        ExceptionToThrow = null;
    }

    public Task<ForecastingResponse> ForecastAsync(
        ForecastingRequest request, CancellationToken cancellationToken = default)
    {
        Calls++;
        LastRequest = request;

        if (ExceptionToThrow is not null)
        {
            throw ExceptionToThrow;
        }

        var horizon = request.Horizon ?? 28;
        var last = request.Series.Max(p => p.Date);
        var methodUsed = string.IsNullOrEmpty(request.Method) || request.Method == "auto" ? "ets" : request.Method;

        var response = new ForecastingResponse
        {
            MethodUsed = methodUsed,
            Horizon = horizon,
            HoldoutDays = 14,
            FilledMissingDays = 0,
            Interval = JsonDocument.Parse("0.8").RootElement.Clone(),
            Backtest = new Dictionary<string, BacktestMetrics>
            {
                ["naive"] = new BacktestMetrics { Mae = 5.0, Rmse = 6.5 },
                ["ets"] = new BacktestMetrics { Mae = 3.0, Rmse = 4.0 }
            },
            Forecast = Enumerable.Range(1, horizon)
                .Select(i => new ForecastPointDto
                {
                    Date = last.AddDays(i),
                    Yhat = 100 + i,
                    Lower = 90 + i,
                    Upper = 110 + i
                })
                .ToList()
        };

        return Task.FromResult(response);
    }
}
