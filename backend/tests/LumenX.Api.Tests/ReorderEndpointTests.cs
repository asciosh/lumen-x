using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace LumenX.Api.Tests;

public class ReorderEndpointTests : IClassFixture<LumenXFactory>
{
    private readonly HttpClient _client;

    public ReorderEndpointTests(LumenXFactory factory)
    {
        factory.Fake.Reset();
        _client = factory.CreateClient();
    }

    // The fake service returns 28 days with yhat = 100 + i and RMSE 4 for ETS.
    private async Task<int> ProductWithForecastAsync()
    {
        var id = await TestData.CreateProductAsync(_client, TestData.UniqueName());
        var import = await TestData.ImportCsvAsync(_client, id, TestData.BuildCsv(new DateOnly(2025, 1, 1), 60));
        import.EnsureSuccessStatusCode();
        var forecast = await _client.PostAsJsonAsync($"/products/{id}/forecast", new { });
        forecast.EnsureSuccessStatusCode();
        return id;
    }

    [Fact]
    public async Task Unknown_product_returns_404()
    {
        var response = await _client.GetAsync("/products/999999/reorder");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Product_without_forecast_returns_404()
    {
        var id = await TestData.CreateProductAsync(_client);

        var response = await _client.GetAsync($"/products/{id}/reorder");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Default_parameters_cover_fourteen_days_at_95_percent()
    {
        var id = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/reorder");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(14, json.GetProperty("periodDays").GetInt32());
        Assert.Equal(95, json.GetProperty("serviceLevelPercent").GetInt32());
        Assert.Equal(1505.0, json.GetProperty("demandInPeriod").GetDouble(), 6);   // sum of 100+i for i = 1..14
        Assert.Equal(24.62, json.GetProperty("safetyStock").GetDouble(), 2);        // 1,6449 x 4 x radice(14)
        Assert.Equal(1529.62, json.GetProperty("orderUpToLevel").GetDouble(), 2);
        Assert.Equal(JsonValueKind.Null, json.GetProperty("suggestedOrder").ValueKind);
    }

    [Fact]
    public async Task On_hand_gives_a_suggested_order_rounded_up()
    {
        var id = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/reorder?onHand=500");

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1030.0, json.GetProperty("suggestedOrder").GetDouble(), 6);   // 1529,62 - 500 -> 1030
    }

    [Fact]
    public async Task Plenty_of_stock_gives_order_zero()
    {
        var id = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/reorder?onHand=2000");

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0.0, json.GetProperty("suggestedOrder").GetDouble(), 6);
    }

    [Fact]
    public async Task Parameters_change_the_period_and_the_safety_stock()
    {
        var id = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/reorder?leadTimeDays=7&reviewDays=0&serviceLevel=99");

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(7, json.GetProperty("periodDays").GetInt32());
        Assert.Equal(2.3263 * 4 * Math.Sqrt(7), json.GetProperty("safetyStock").GetDouble(), 2);
    }

    [Theory]
    [InlineData("serviceLevel=97")]
    [InlineData("leadTimeDays=0")]
    [InlineData("leadTimeDays=30&reviewDays=7")]   // 37 days, but the fake's forecast has 28
    [InlineData("onHand=-3")]
    public async Task Invalid_parameters_return_422(string query)
    {
        var id = await ProductWithForecastAsync();

        var response = await _client.GetAsync($"/products/{id}/reorder?{query}");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }
}
