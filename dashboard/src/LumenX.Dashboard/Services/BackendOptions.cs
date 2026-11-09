namespace LumenX.Dashboard.Services;

public sealed class BackendOptions
{
    public string BaseUrl { get; set; } = "http://localhost:8080";

    // The LightGBM forecast can take time: generous timeout.
    public int TimeoutSeconds { get; set; } = 120;
}
