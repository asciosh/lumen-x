using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace LumenX.Api.Tests;

public class SalesImportTests : IClassFixture<LumenXFactory>
{
    private readonly HttpClient _client;

    public SalesImportTests(LumenXFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Import_mixed_formats_reports_bad_rows_and_keeps_valid_ones()
    {
        var productId = await TestData.CreateProductAsync(_client);
        var csv = "date;quantity\n" +
                  "01/02/2025;12,5\n" +
                  "2025-02-02;7\n" +
                  "non-una-data;3\n" +
                  "03/02/2025;abc\n";

        var response = await TestData.ImportCsvAsync(_client, productId, csv);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(4, json.GetProperty("totalRows").GetInt32());
        Assert.Equal(2, json.GetProperty("inserted").GetInt32());
        Assert.Equal(0, json.GetProperty("updated").GetInt32());
        Assert.Equal(2, json.GetProperty("rejected").GetInt32());
        Assert.Equal(2, json.GetProperty("errors").GetArrayLength());

        var sales = await _client.GetFromJsonAsync<JsonElement>($"/products/{productId}/sales");
        Assert.Equal(2, sales.GetArrayLength());
        Assert.Equal("2025-02-01", sales[0].GetProperty("date").GetString());
        Assert.Equal(12.5, sales[0].GetProperty("quantity").GetDouble());
    }

    [Fact]
    public async Task Import_twice_updates_existing_days_instead_of_duplicating()
    {
        var productId = await TestData.CreateProductAsync(_client);

        await TestData.ImportCsvAsync(_client, productId, "date,quantity\n2025-03-01,10\n");
        var second = await TestData.ImportCsvAsync(_client, productId,
            "date,quantity\n2025-03-01,20\n2025-03-02,30\n");

        var json = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, json.GetProperty("inserted").GetInt32());
        Assert.Equal(1, json.GetProperty("updated").GetInt32());

        var sales = await _client.GetFromJsonAsync<JsonElement>($"/products/{productId}/sales");
        Assert.Equal(2, sales.GetArrayLength());
        Assert.Equal(20.0, sales[0].GetProperty("quantity").GetDouble());
    }

    [Fact]
    public async Task Same_date_twice_in_one_file_last_row_wins()
    {
        var productId = await TestData.CreateProductAsync(_client);

        var response = await TestData.ImportCsvAsync(_client, productId,
            "date,quantity\n2025-04-01,10\n2025-04-01,99\n");

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, json.GetProperty("inserted").GetInt32());
        Assert.Equal(1, json.GetProperty("duplicatesInFile").GetInt32());

        var sales = await _client.GetFromJsonAsync<JsonElement>($"/products/{productId}/sales");
        Assert.Equal(1, sales.GetArrayLength());
        Assert.Equal(99.0, sales[0].GetProperty("quantity").GetDouble());
    }

    [Fact]
    public async Task Sales_can_be_filtered_by_from_and_to()
    {
        var productId = await TestData.CreateProductAsync(_client);
        await TestData.ImportCsvAsync(_client, productId, TestData.BuildCsv(new DateOnly(2025, 1, 1), 10));

        var filtered = await _client.GetFromJsonAsync<JsonElement>(
            $"/products/{productId}/sales?from=2025-01-03&to=2025-01-05");

        Assert.Equal(3, filtered.GetArrayLength());
        Assert.Equal("2025-01-03", filtered[0].GetProperty("date").GetString());
        Assert.Equal("2025-01-05", filtered[2].GetProperty("date").GetString());

        var onlyFrom = await _client.GetFromJsonAsync<JsonElement>(
            $"/products/{productId}/sales?from=2025-01-09");
        Assert.Equal(2, onlyFrom.GetArrayLength());
    }

    [Fact]
    public async Task From_after_to_returns_422()
    {
        var productId = await TestData.CreateProductAsync(_client);

        var response = await _client.GetAsync($"/products/{productId}/sales?from=2025-02-01&to=2025-01-01");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Import_for_unknown_product_returns_404()
    {
        var response = await TestData.ImportCsvAsync(_client, 999999, "date,quantity\n2025-01-01,1\n");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Import_with_missing_columns_returns_422()
    {
        var productId = await TestData.CreateProductAsync(_client);

        var response = await TestData.ImportCsvAsync(_client, productId, "giorno,qta\n2025-01-01,1\n");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }
}
