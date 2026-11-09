using System.Text.Json;
using LumenX.Dashboard.Services;
using LumenX.Dashboard.Tests.TestSupport;

namespace LumenX.Dashboard.Tests;

public class LumenApiClientTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>Gestore HTTP finto: registra indirizzo e corpo di ogni richiesta e risponde come deciso dal test.</summary>
    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _respond;

        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
        {
            _respond = respond;
        }

        public List<string> Urls { get; } = new();
        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Urls.Add(request.RequestUri!.PathAndQuery);
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return _respond(request);
        }
    }

    private static HttpResponseMessage Json(object body, System.Net.HttpStatusCode status = System.Net.HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(JsonSerializer.Serialize(body, Web), System.Text.Encoding.UTF8, "application/json") };

    private static LumenApiClient ClientFor(StubHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new Uri("http://backend/") });

    private static ReorderSuggestionDto SampleReorder() =>
        new(1, "blend", 7, 7, 14, 95, 1.6449, 1400, 20, 123.09, 1523.09, 300.5, 1223, new List<string>());

    [Fact]
    public async Task Reorder_url_carries_all_parameters_with_a_dot_as_decimal_separator()
    {
        var handler = new StubHandler(_ => Json(SampleReorder()));

        var result = await ClientFor(handler).GetReorderAsync(5, 7, 14, 99, 300.5);

        Assert.True(result.IsSuccess);
        Assert.Equal("/products/5/reorder?leadTimeDays=7&reviewDays=14&serviceLevel=99&onHand=300.5", handler.Urls.Single());
        Assert.Equal(1223, result.Value!.SuggestedOrder);
    }

    [Fact]
    public async Task Reorder_url_has_no_on_hand_when_it_is_not_given()
    {
        var handler = new StubHandler(_ => Json(SampleReorder()));

        await ClientFor(handler).GetReorderAsync(5, 7, 7, 95, null);

        Assert.DoesNotContain("onHand", handler.Urls.Single());
    }

    [Fact]
    public async Task Explanation_url_has_language_and_ai_flag()
    {
        var handler = new StubHandler(_ => Json(new ExplanationDto(1, "en", "Text", "gemini", null)));

        var result = await ClientFor(handler).GetExplanationAsync(5, "en", true);

        Assert.Equal("/products/5/forecast/explanation?lang=en&useAi=true", handler.Urls.Single());
        Assert.Equal("gemini", result.Value!.Source);
    }

    [Fact]
    public async Task Sales_filter_dates_are_sent_as_iso()
    {
        var handler = new StubHandler(_ => Json(Samples.Sales(3)));

        await ClientFor(handler).GetSalesAsync(5, new DateOnly(2025, 1, 31), null);
        await ClientFor(handler).GetSalesAsync(5, null, new DateOnly(2025, 2, 9));
        await ClientFor(handler).GetSalesAsync(5, null, null);

        Assert.Equal(new[]
        {
            "/products/5/sales?from=2025-01-31",
            "/products/5/sales?to=2025-02-09",
            "/products/5/sales"
        }, handler.Urls.ToArray());
    }

    [Fact]
    public async Task Question_is_posted_as_json_to_the_ask_endpoint()
    {
        var handler = new StubHandler(_ => Json(new AskResponseDto("Quanto ho venduto?", "it", "sales_total", true, "Hai venduto 100 unità.", new List<string>())));

        var result = await ClientFor(handler).AskAsync(5, "Quanto ho venduto?");

        Assert.True(result.IsSuccess);
        Assert.Equal("/products/5/ask", handler.Urls.Single());
        Assert.Equal("{\"question\":\"Quanto ho venduto?\",\"language\":null}", handler.LastBody);
        Assert.Equal("Hai venduto 100 unità.", result.Value!.Answer);
        Assert.Equal("sales_total", result.Value.Intent);
    }

    [Fact]
    public async Task Question_with_accents_and_quotes_survives_the_round_trip()
    {
        var handler = new StubHandler(_ => Json(new AskResponseDto("q", "it", "unknown", false, "ok", new List<string> { "Esempio uno", "Esempio due" })));

        var result = await ClientFor(handler).AskAsync(5, "Qual è il giorno \"più forte\"?");

        // Sul filo gli accenti viaggiano come sequenze \uXXXX: conta che il server riceva la domanda identica.
        using var sent = JsonDocument.Parse(handler.LastBody!);
        Assert.Equal("Qual è il giorno \"più forte\"?", sent.RootElement.GetProperty("question").GetString());
        Assert.Equal(new[] { "Esempio uno", "Esempio due" }, result.Value!.Suggestions.ToArray());
    }

    [Fact]
    public async Task Rejected_question_shows_the_backend_message()
    {
        var handler = new StubHandler(_ => Json(
            new { title = "Dati non validi", detail = "Scrivi una domanda di almeno 3 e al massimo 300 caratteri.", status = 422 },
            System.Net.HttpStatusCode.UnprocessableEntity));

        var result = await ClientFor(handler).AskAsync(5, "ab");

        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.Contains("almeno 3", result.ErrorText);
    }

    [Fact]
    public async Task Forecast_request_is_sent_as_camel_case_json()
    {
        var handler = new StubHandler(_ => Json(Samples.Forecast()));

        var result = await ClientFor(handler).CreateForecastAsync(5, 28, "auto");

        Assert.True(result.IsSuccess);
        Assert.Equal("/products/5/forecast", handler.Urls.Single());
        Assert.Equal("{\"horizon\":28,\"method\":\"auto\"}", handler.LastBody);
        Assert.Equal(28, result.Value!.Forecast.Count);
    }

    [Fact]
    public async Task Csv_import_is_sent_as_multipart_with_the_file_name()
    {
        var handler = new StubHandler(_ => Json(new ImportResultDto(2, 2, 2, 0, 0, 0, new List<RowErrorDto>(), false)));
        using var content = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("date,quantity\n2025-01-01,10\n"));

        var result = await ClientFor(handler).ImportSalesAsync(5, "pane.csv", content);

        Assert.True(result.IsSuccess);
        Assert.Equal("/products/5/sales/import", handler.Urls.Single());
        Assert.Contains("pane.csv", handler.LastBody);
        Assert.Contains("2025-01-01,10", handler.LastBody);
    }

    [Fact]
    public async Task Problem_details_message_is_extracted_from_error_responses()
    {
        var handler = new StubHandler(_ => Json(
            new { title = "Dati non validi", detail = "Servono almeno 42 giorni di vendite.", status = 422 },
            System.Net.HttpStatusCode.UnprocessableEntity));

        var result = await ClientFor(handler).CreateForecastAsync(5, null, null);

        Assert.False(result.IsSuccess);
        Assert.Equal(422, result.StatusCode);
        Assert.Equal("Servono almeno 42 giorni di vendite.", result.Error);
        Assert.StartsWith("Dati non validi:", result.ErrorText);
    }

    [Fact]
    public async Task Error_body_that_is_not_json_falls_back_to_the_status_code()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(System.Net.HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("<html>boom</html>")
        });

        var result = await ClientFor(handler).GetProductsAsync();

        Assert.Equal(500, result.StatusCode);
        Assert.Equal("Errore HTTP 500.", result.Error);
    }

    [Fact]
    public async Task Unreachable_backend_becomes_status_zero_with_a_clear_message()
    {
        var handler = new StubHandler(_ => throw new HttpRequestException("connection refused"));

        var result = await ClientFor(handler).GetProductsAsync();

        Assert.False(result.IsSuccess);
        Assert.Equal(0, result.StatusCode);
        Assert.Contains("non raggiungibile", result.Error);
    }

    [Fact]
    public async Task Timeout_is_reported_as_such()
    {
        var handler = new StubHandler(_ => throw new TaskCanceledException("timeout"));

        var result = await ClientFor(handler).GetProductsAsync();

        Assert.Equal(0, result.StatusCode);
        Assert.Contains("timeout", result.Error);
    }

    [Fact]
    public async Task Unexpected_json_shape_is_reported_without_throwing()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent("{\"not\":\"a list\"}", System.Text.Encoding.UTF8, "application/json")
        });

        var result = await ClientFor(handler).GetProductsAsync();

        Assert.False(result.IsSuccess);
        Assert.Equal(0, result.StatusCode);
    }
}
