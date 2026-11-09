namespace LumenX.Api.Explanations;

public sealed class GeminiOptions
{
    /// <summary>API key: only from an environment variable / secret, never in the code or in appsettings.</summary>
    public string? ApiKey { get; set; }

    /// <summary>Model name. It changes often: check the ones available in Google AI Studio.</summary>
    public string Model { get; set; } = "gemini-3.5-flash";

    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com/";

    public int TimeoutSeconds { get; set; } = 20;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}
