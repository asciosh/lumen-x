namespace LumenX.Dashboard.Services;

public sealed class BackendOptions
{
    public string BaseUrl { get; set; } = "http://localhost:8080";

    // Il forecast con LightGBM puo' richiedere tempo: timeout generoso.
    public int TimeoutSeconds { get; set; } = 120;
}
