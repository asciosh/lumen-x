using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace LumenX.Api.Explanations;

/// <summary>
/// Riscrive in modo naturale i fatti gia' calcolati usando l'API Gemini (REST, generateContent).
/// All'AI vanno solo i fatti aggregati: niente vendite grezze, e le e' vietato fare nuovi calcoli.
/// </summary>
public sealed class GeminiExplainer : IExplainer
{
    private const int MaxTextLength = 2000;

    // Encoder "rilassato": gli accenti restano caratteri normali (con quello di default diventerebbero \u00E8).
    private static readonly JsonSerializerOptions FactsJson = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private static readonly JsonSerializerOptions BodyJson = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private readonly HttpClient _http;
    private readonly GeminiOptions _options;

    public GeminiExplainer(HttpClient http, IOptions<GeminiOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public async Task<ExplanationResult> ExplainAsync(
        ExplanationFacts facts, string language, CancellationToken cancellationToken = default)
    {
        if (!_options.IsConfigured)
        {
            throw new ExplanationUnavailableException("Gemini non e' configurato (manca la chiave API).");
        }

        var languageName = language == ExplanationLanguage.English ? "English" : "Italian";

        var system =
            "You write short explanations of sales forecasts for owners of small businesses. " +
            "Use ONLY the facts in the JSON you receive. Do not invent figures and do not compute new ones " +
            "(no new sums, differences or percentages): you may round the numbers you are given. " +
            "If the facts show a wide confidence interval or a method not better than the naive benchmark, say that the forecast is uncertain. " +
            "The method \"blend\" in MethodUsed means the average of the ETS and LightGBM forecasts. " +
            "If ZeroDaysPercent is 20 or more, say that the series has many days with zero sales and that the forecast is unreliable. " +
            "Do not give investment or purchasing advice. Do not mention JSON or field names. " +
            $"Write in {languageName}, in 3 to 5 sentences, as plain text with no markdown and no lists.";

        var user =
            "Facts (JSON):\n" + JsonSerializer.Serialize(facts, FactsJson) +
            $"\n\nWrite the explanation in {languageName}.";

        var body = new JsonObject
        {
            ["system_instruction"] = new JsonObject
            {
                ["parts"] = new JsonArray(new JsonObject { ["text"] = system })
            },
            ["contents"] = new JsonArray(new JsonObject
            {
                ["parts"] = new JsonArray(new JsonObject { ["text"] = user })
            }),
            ["generationConfig"] = new JsonObject
            {
                ["temperature"] = 0.3,
                ["thinkingConfig"] = new JsonObject { ["thinkingLevel"] = "low" }
            }
        };

        using var request = new HttpRequestMessage(
            HttpMethod.Post, $"v1beta/models/{Uri.EscapeDataString(_options.Model)}:generateContent");
        // La chiave va nell'header, non nell'URL, cosi' non finisce nei log.
        request.Headers.Add("x-goog-api-key", _options.ApiKey);
        request.Content = new StringContent(body.ToJsonString(BodyJson), Encoding.UTF8, "application/json");

        try
        {
            using var response = await _http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new ExplanationUnavailableException($"Gemini ha risposto con HTTP {(int)response.StatusCode}.");
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            var text = ExtractText(json);

            // L'AI puo' sbagliare i numeri: se scrive cifre che non sono nei fatti, il testo non si usa.
            var unsupported = NumberGuard.FindUnsupportedNumbers(text, facts, language);
            if (unsupported.Count > 0)
            {
                throw new ExplanationUnavailableException(
                    "Il testo di Gemini contiene numeri che non sono nei fatti: " + string.Join(", ", unsupported),
                    note: "ai_rejected");
            }

            return new ExplanationResult(text, "gemini");
        }
        catch (HttpRequestException ex)
        {
            throw new ExplanationUnavailableException("Gemini non raggiungibile.", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ExplanationUnavailableException("Gemini non ha risposto in tempo.", ex);
        }
        catch (JsonException ex)
        {
            throw new ExplanationUnavailableException("Risposta di Gemini in un formato non atteso.", ex);
        }
    }

    private static string ExtractText(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        if (!root.TryGetProperty("candidates", out var candidates)
            || candidates.ValueKind != JsonValueKind.Array
            || candidates.GetArrayLength() == 0)
        {
            throw new ExplanationUnavailableException("Gemini non ha restituito risposte.");
        }

        var first = candidates[0];
        if (!first.TryGetProperty("content", out var content)
            || !content.TryGetProperty("parts", out var parts)
            || parts.ValueKind != JsonValueKind.Array)
        {
            throw new ExplanationUnavailableException("Gemini ha restituito una risposta senza testo.");
        }

        var sb = new StringBuilder();
        foreach (var part in parts.EnumerateArray())
        {
            if (part.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
            {
                sb.Append(text.GetString());
            }
        }

        var result = sb.ToString().Trim();
        if (result.Length == 0)
        {
            throw new ExplanationUnavailableException("Gemini ha restituito un testo vuoto.");
        }
        if (result.Length > MaxTextLength)
        {
            throw new ExplanationUnavailableException("Gemini ha restituito un testo troppo lungo.");
        }

        return result;
    }
}
