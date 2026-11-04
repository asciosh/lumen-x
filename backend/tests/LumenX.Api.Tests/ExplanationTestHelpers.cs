using System.Net;
using System.Text;
using LumenX.Api.Explanations;
using Microsoft.Extensions.Options;

namespace LumenX.Api.Tests;

/// <summary>Gestore HTTP finto: nessuna rete. Registra l'ultima richiesta (come stringhe, a richiesta gia' chiusa).</summary>
public sealed class StubHandler : HttpMessageHandler
{
    private readonly Func<HttpResponseMessage> _responder;

    public StubHandler(Func<HttpResponseMessage> responder)
    {
        _responder = responder;
    }

    public int Calls { get; private set; }
    public string? LastUri { get; private set; }
    public string? LastApiKeyHeader { get; private set; }
    public string? LastBody { get; private set; }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Calls++;
        LastUri = request.RequestUri?.ToString();
        LastApiKeyHeader = request.Headers.TryGetValues("x-goog-api-key", out var values) ? values.FirstOrDefault() : null;
        LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        return _responder();
    }

    public static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

public static class ExplanationTestData
{
    public static ExplanationFacts Facts() => new(
        ProductName: "Caffè",
        HistoryDays: 90,
        HistoryEnd: new DateOnly(2025, 3, 31),
        MethodUsed: "ets",
        Horizon: 28,
        ForecastStart: new DateOnly(2025, 4, 1),
        ForecastEnd: new DateOnly(2025, 4, 28),
        ForecastTotal: 3360.0,
        ForecastAvgPerDay: 120.0,
        ReferenceDays: 28,
        ReferenceAvgPerDay: 100.0,
        ChangePercent: 20.0,
        StrongestWeekday: "Saturday",
        StrongestWeekdayAvg: 150.0,
        WeakestWeekday: "Monday",
        WeakestWeekdayAvg: 90.0,
        IntervalHalfWidthPercent: 12.0,
        HoldoutDays: 14,
        MaeUsed: 3.0,
        MaeNaive: 5.0,
        ImprovementVsNaivePercent: 40.0,
        FilledMissingDays: 0);

    public static GeminiOptions Options(string? apiKey) => new()
    {
        ApiKey = apiKey,
        Model = "test-model",
        BaseUrl = "https://example.test/"
    };

    public static GeminiExplainer Gemini(StubHandler handler, string? apiKey)
    {
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://example.test/") };
        return new GeminiExplainer(http, Microsoft.Extensions.Options.Options.Create(Options(apiKey)));
    }

    public const string GeminiOkJson =
        "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Testo di prova da Gemini.\"}]}}]}";
}
