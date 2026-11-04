namespace LumenX.Api.Forecasting;

public sealed class ForecastingOptions
{
    public string BaseUrl { get; set; } = "http://localhost:8000";
    public int TimeoutSeconds { get; set; } = 120;
}
