namespace LumenX.Api.Explanations;

public sealed class GeminiOptions
{
    /// <summary>Chiave API: solo da variabile d'ambiente / segreto, mai nel codice o in appsettings.</summary>
    public string? ApiKey { get; set; }

    /// <summary>Nome del modello. Cambia spesso: controlla quelli disponibili in Google AI Studio.</summary>
    public string Model { get; set; } = "gemini-3.5-flash";

    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com/";

    public int TimeoutSeconds { get; set; } = 20;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(ApiKey);
}
