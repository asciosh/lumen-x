using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace LumenX.Api.Tests;

public class HealthAndProductTests : IClassFixture<LumenXFactory>
{
    private readonly HttpClient _client;

    public HealthAndProductTests(LumenXFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Health_returns_ok()
    {
        var response = await _client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("ok", json.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Create_product_returns_201_and_it_appears_in_list()
    {
        var name = TestData.UniqueName();

        var created = await _client.PostAsJsonAsync("/products", new { name, sku = "SKU-1" });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var createdJson = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = createdJson.GetProperty("id").GetInt32();
        Assert.Equal(name, createdJson.GetProperty("name").GetString());

        var list = await _client.GetFromJsonAsync<JsonElement>("/products");
        var ids = list.EnumerateArray().Select(p => p.GetProperty("id").GetInt32()).ToList();
        Assert.Contains(id, ids);

        var single = await _client.GetAsync($"/products/{id}");
        Assert.Equal(HttpStatusCode.OK, single.StatusCode);
    }

    [Fact]
    public async Task Duplicate_product_name_returns_409()
    {
        var name = TestData.UniqueName();
        await TestData.CreateProductAsync(_client, name);

        var second = await _client.PostAsJsonAsync("/products", new { name = name.ToUpperInvariant() });

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Empty_product_name_returns_422()
    {
        var response = await _client.PostAsJsonAsync("/products", new { name = "   " });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_product_returns_404()
    {
        var response = await _client.GetAsync("/products/999999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
