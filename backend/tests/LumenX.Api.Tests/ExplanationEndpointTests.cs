using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace LumenX.Api.Tests;

public class ExplanationEndpointTests : IClassFixture<LumenXFactory>
{
    private readonly HttpClient _client;

    public ExplanationEndpointTests(LumenXFactory factory)
    {
        factory.Fake.Reset();
        _client = factory.CreateClient();
    }

    private async Task<(int Id, string Name)> ProductWithForecastAsync()
    {
        var name = TestData.UniqueName();
        var id = await TestData.CreateProductAsync(_client, name);
        var import = await TestData.ImportCsvAsync(_client, id, TestData.BuildCsv(new DateOnly(2025, 1, 1), 60));
        import.EnsureSuccessStatusCode();
        var forecast = await _client.PostAsJsonAsync($"/products/{id}/forecast", new { });
        forecast.EnsureSuccessStatusCode();
        return (id, name);
    }

    [Fact]
    public async Task Unknown_product_returns_404()
    {
        var response = await _client.GetAsync("/products/999999/forecast/explanation");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Product_without_forecast_returns_404()
    {
        var id = await TestData.CreateProductAsync(_client);

        var response = await _client.GetAsync($"/products/{id}/forecast/explanation");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Default_explanation_is_italian_template_text()
    {
        var (id, name) = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/forecast/explanation?useAi=false");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("it", json.GetProperty("language").GetString());
        Assert.Equal("template", json.GetProperty("source").GetString());
        var text = json.GetProperty("text").GetString()!;
        Assert.Contains(name, text);
        Assert.Contains("28 giorni", text);
        Assert.Equal(28, json.GetProperty("facts").GetProperty("horizon").GetInt32());
    }

    [Fact]
    public async Task English_explanation_is_returned_with_lang_en()
    {
        var (id, _) = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/forecast/explanation?lang=en&useAi=false");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("en", json.GetProperty("language").GetString());
        Assert.Contains("28 days", json.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Unsupported_language_returns_422()
    {
        var (id, _) = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/forecast/explanation?lang=fr");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Ai_requested_without_key_returns_template_with_note()
    {
        var (id, _) = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/forecast/explanation?useAi=true");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("template", json.GetProperty("source").GetString());
        Assert.Equal("ai_not_configured", json.GetProperty("note").GetString());
    }
}
