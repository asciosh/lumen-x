using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LumenX.Api.Forecasting;

namespace LumenX.Api.Tests;

public class ForecastTests : IClassFixture<LumenXFactory>
{
    private readonly FakeForecastingClient _fake;
    private readonly HttpClient _client;

    public ForecastTests(LumenXFactory factory)
    {
        _fake = factory.Fake;
        _fake.Reset();
        _client = factory.CreateClient();
    }

    private async Task<int> ProductWithSalesAsync(int days)
    {
        var productId = await TestData.CreateProductAsync(_client);
        var import = await TestData.ImportCsvAsync(_client, productId, TestData.BuildCsv(new DateOnly(2025, 1, 1), days));
        import.EnsureSuccessStatusCode();
        return productId;
    }

    [Fact]
    public async Task Fewer_than_42_days_returns_422_without_calling_the_service()
    {
        var productId = await ProductWithSalesAsync(41);

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(0, _fake.Calls);
    }

    [Fact]
    public async Task Exactly_42_days_is_enough()
    {
        var productId = await ProductWithSalesAsync(42);

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(1, _fake.Calls);
    }

    [Fact]
    public async Task Forecast_is_saved_and_returned_and_latest_returns_the_same_run()
    {
        var productId = await ProductWithSalesAsync(60);

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var runId = json.GetProperty("id").GetInt32();
        Assert.Equal(productId, json.GetProperty("productId").GetInt32());
        Assert.Equal("ets", json.GetProperty("methodUsed").GetString());
        Assert.Equal(28, json.GetProperty("horizon").GetInt32());
        Assert.Equal(28, json.GetProperty("forecast").GetArrayLength());
        Assert.Equal(3.0, json.GetProperty("backtest").GetProperty("ets").GetProperty("mae").GetDouble());

        // La serie inviata al servizio contiene tutti i 60 giorni.
        Assert.NotNull(_fake.LastRequest);
        Assert.Equal(60, _fake.LastRequest!.Series.Count);

        var latest = await _client.GetAsync($"/products/{productId}/forecast");
        Assert.Equal(HttpStatusCode.OK, latest.StatusCode);
        var latestJson = await latest.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(runId, latestJson.GetProperty("id").GetInt32());
        Assert.Equal(28, latestJson.GetProperty("forecast").GetArrayLength());
        Assert.Equal("2025-03-02", latestJson.GetProperty("forecast")[0].GetProperty("date").GetString());
    }

    [Fact]
    public async Task Horizon_and_method_are_passed_to_the_service()
    {
        var productId = await ProductWithSalesAsync(60);

        var response = await _client.PostAsJsonAsync(
            $"/products/{productId}/forecast", new { horizon = 7, method = "Naive" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(7, _fake.LastRequest!.Horizon);
        Assert.Equal("naive", _fake.LastRequest.Method);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(7, json.GetProperty("forecast").GetArrayLength());
        Assert.Equal("naive", json.GetProperty("methodRequested").GetString());
    }

    [Fact]
    public async Task Latest_returns_the_most_recent_run()
    {
        var productId = await ProductWithSalesAsync(60);
        await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { horizon = 7 });
        await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { horizon = 14 });

        var latest = await _client.GetFromJsonAsync<JsonElement>($"/products/{productId}/forecast");

        Assert.Equal(14, latest.GetProperty("horizon").GetInt32());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(91)]
    [InlineData(-5)]
    public async Task Invalid_horizon_returns_422(int horizon)
    {
        var productId = await ProductWithSalesAsync(60);

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { horizon });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(0, _fake.Calls);
    }

    [Fact]
    public async Task Invalid_method_returns_422()
    {
        var productId = await ProductWithSalesAsync(60);

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { method = "prophet" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(0, _fake.Calls);
    }

    [Fact]
    public async Task Service_422_becomes_422()
    {
        var productId = await ProductWithSalesAsync(60);
        _fake.ExceptionToThrow = new ForecastingInputException("troppi giorni mancanti");

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(1, _fake.Calls);
    }

    [Fact]
    public async Task Service_unreachable_becomes_503()
    {
        var productId = await ProductWithSalesAsync(60);
        _fake.ExceptionToThrow = new ForecastingUnavailableException("giù");

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Service_other_errors_become_502()
    {
        var productId = await ProductWithSalesAsync(60);
        _fake.ExceptionToThrow = new ForecastingFailedException("HTTP 500");

        var response = await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { });

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
    }

    [Fact]
    public async Task Failed_calls_do_not_save_a_run()
    {
        var productId = await ProductWithSalesAsync(60);
        _fake.ExceptionToThrow = new ForecastingUnavailableException("giù");
        await _client.PostAsJsonAsync($"/products/{productId}/forecast", new { });

        var latest = await _client.GetAsync($"/products/{productId}/forecast");

        Assert.Equal(HttpStatusCode.NotFound, latest.StatusCode);
    }

    [Fact]
    public async Task Latest_without_any_forecast_returns_404()
    {
        var productId = await TestData.CreateProductAsync(_client);

        var response = await _client.GetAsync($"/products/{productId}/forecast");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Forecast_for_unknown_product_returns_404()
    {
        var response = await _client.PostAsJsonAsync("/products/999999/forecast", new { });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
