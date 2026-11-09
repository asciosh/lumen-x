using System.Text.Json;
using System.Text.Json.Serialization;

namespace LumenX.Api.Forecasting;

// Contract of the Python service (JSON in snake_case): names fixed with JsonPropertyName.

public sealed class SeriesPointDto
{
    [JsonPropertyName("date")]
    public DateOnly Date { get; set; }

    [JsonPropertyName("value")]
    public double Value { get; set; }
}

public sealed class ForecastingRequest
{
    [JsonPropertyName("series")]
    public List<SeriesPointDto> Series { get; set; } = new();

    [JsonPropertyName("horizon")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? Horizon { get; set; }

    [JsonPropertyName("method")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Method { get; set; }
}

public sealed class BacktestMetrics
{
    [JsonPropertyName("mae")]
    public double? Mae { get; set; }

    [JsonPropertyName("rmse")]
    public double? Rmse { get; set; }
}

public sealed class ForecastPointDto
{
    [JsonPropertyName("date")]
    public DateOnly Date { get; set; }

    [JsonPropertyName("yhat")]
    public double Yhat { get; set; }

    [JsonPropertyName("lower")]
    public double Lower { get; set; }

    [JsonPropertyName("upper")]
    public double Upper { get; set; }
}

public sealed class ForecastingResponse
{
    [JsonPropertyName("method_used")]
    public string MethodUsed { get; set; } = string.Empty;

    [JsonPropertyName("horizon")]
    public int Horizon { get; set; }

    [JsonPropertyName("holdout_days")]
    public int HoldoutDays { get; set; }

    [JsonPropertyName("filled_missing_days")]
    public int FilledMissingDays { get; set; }

    /// <summary>Type not assumed: kept as raw JSON.</summary>
    [JsonPropertyName("interval")]
    public JsonElement? Interval { get; set; }

    [JsonPropertyName("backtest")]
    public Dictionary<string, BacktestMetrics>? Backtest { get; set; }

    [JsonPropertyName("forecast")]
    public List<ForecastPointDto> Forecast { get; set; } = new();
}
