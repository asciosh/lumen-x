using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace LumenX.Api.Tests;

public class ChatEndpointTests : IClassFixture<LumenXFactory>
{
    private readonly HttpClient _client;

    public ChatEndpointTests(LumenXFactory factory)
    {
        factory.Fake.Reset();
        _client = factory.CreateClient();
    }

    private async Task<int> ProductWithSalesAsync(bool withForecast = false)
    {
        var id = await TestData.CreateProductAsync(_client, TestData.UniqueName());
        var import = await TestData.ImportCsvAsync(_client, id, TestData.BuildCsv(new DateOnly(2025, 1, 1), 60));
        import.EnsureSuccessStatusCode();
        if (withForecast)
        {
            var forecast = await _client.PostAsJsonAsync($"/products/{id}/forecast", new { });
            forecast.EnsureSuccessStatusCode();
        }

        return id;
    }

    private async Task<JsonElement> AskAsync(int productId, object body)
    {
        var response = await _client.PostAsJsonAsync($"/products/{productId}/ask", body);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Unknown_product_returns_404()
    {
        var response = await _client.PostAsJsonAsync("/products/999999/ask", new { question = "Quanto ho venduto?" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("ab")]
    public async Task Missing_or_too_short_question_returns_422(string question)
    {
        var id = await ProductWithSalesAsync();

        var response = await _client.PostAsJsonAsync($"/products/{id}/ask", new { question });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Too_long_question_returns_422()
    {
        var id = await ProductWithSalesAsync();

        var response = await _client.PostAsJsonAsync($"/products/{id}/ask", new { question = new string('a', 301) });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Unsupported_language_returns_422()
    {
        var id = await ProductWithSalesAsync();

        var response = await _client.PostAsJsonAsync($"/products/{id}/ask", new { question = "Quanto ho venduto?", language = "fr" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Sales_question_is_answered_in_italian_by_default()
    {
        var id = await ProductWithSalesAsync();

        var json = await AskAsync(id, new { question = "Quanto ho venduto negli ultimi 30 giorni?" });

        Assert.Equal("it", json.GetProperty("language").GetString());
        Assert.Equal("sales_total", json.GetProperty("intent").GetString());
        Assert.True(json.GetProperty("understood").GetBoolean());
        Assert.Contains("hai venduto", json.GetProperty("answer").GetString());
        Assert.Equal("Quanto ho venduto negli ultimi 30 giorni?", json.GetProperty("question").GetString());
        Assert.Equal(0, json.GetProperty("suggestions").GetArrayLength());
    }

    [Fact]
    public async Task Language_is_recognized_from_the_question()
    {
        var id = await ProductWithSalesAsync();

        var json = await AskAsync(id, new { question = "How much did I sell in the last 30 days?" });

        Assert.Equal("en", json.GetProperty("language").GetString());
        Assert.Contains("you sold", json.GetProperty("answer").GetString());
    }

    [Fact]
    public async Task Explicit_language_wins_over_detection()
    {
        var id = await ProductWithSalesAsync();

        var json = await AskAsync(id, new { question = "Quanto ho venduto negli ultimi 30 giorni?", language = "en" });

        Assert.Equal("en", json.GetProperty("language").GetString());
        Assert.Contains("you sold", json.GetProperty("answer").GetString());
    }

    [Fact]
    public async Task Question_outside_the_list_is_not_understood_and_comes_with_examples()
    {
        var id = await ProductWithSalesAsync();

        var json = await AskAsync(id, new { question = "Che tempo fa oggi?" });

        Assert.False(json.GetProperty("understood").GetBoolean());
        Assert.Equal("unknown", json.GetProperty("intent").GetString());
        Assert.Equal(8, json.GetProperty("suggestions").GetArrayLength());
        Assert.StartsWith("Non ho capito", json.GetProperty("answer").GetString());
    }

    [Fact]
    public async Task Forecast_question_without_a_forecast_says_to_compute_it()
    {
        var id = await ProductWithSalesAsync(withForecast: false);

        var json = await AskAsync(id, new { question = "Quanto prevedo di vendere nelle prossime 2 settimane?" });

        Assert.Equal("forecast_total", json.GetProperty("intent").GetString());
        Assert.Contains("non c'è ancora un forecast", json.GetProperty("answer").GetString());
    }

    [Fact]
    public async Task Forecast_question_uses_the_saved_forecast()
    {
        var id = await ProductWithSalesAsync(withForecast: true);

        var json = await AskAsync(id, new { question = "Quanto prevedo di vendere nelle prossime 2 settimane?" });

        Assert.Equal("forecast_total", json.GetProperty("intent").GetString());
        var answer = json.GetProperty("answer").GetString();
        Assert.Contains("prossimi 14 giorni", answer);
        Assert.Contains("1.505", answer);   // the fake service forecasts 100 + i for day i: sum of the first 14 = 1,505
    }

    [Fact]
    public async Task Reorder_question_uses_the_saved_forecast()
    {
        var id = await ProductWithSalesAsync(withForecast: true);

        var json = await AskAsync(id, new { question = "Cosa conviene ordinare?" });

        Assert.Equal("reorder", json.GetProperty("intent").GetString());
        Assert.Contains("domanda prevista 1.505", json.GetProperty("answer").GetString());
    }

    [Fact]
    public async Task Summary_question_returns_the_rule_based_explanation()
    {
        var id = await ProductWithSalesAsync(withForecast: true);

        var json = await AskAsync(id, new { question = "Spiegami la previsione" });

        Assert.Equal("summary", json.GetProperty("intent").GetString());
        Assert.Contains("prevedo circa", json.GetProperty("answer").GetString());
    }
}
