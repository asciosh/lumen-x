using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace LumenX.Api.Tests;

public static class TestData
{
    public static string UniqueName() => "prodotto-" + Guid.NewGuid().ToString("N");

    /// <summary>ISO CSV with commas: date,quantity — one row per day.</summary>
    public static string BuildCsv(DateOnly start, int days)
    {
        var sb = new StringBuilder();
        sb.Append("date,quantity\n");
        for (var i = 0; i < days; i++)
        {
            var date = start.AddDays(i).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var quantity = (10 + i % 7).ToString(CultureInfo.InvariantCulture);
            sb.Append(date).Append(',').Append(quantity).Append('\n');
        }
        return sb.ToString();
    }

    public static async Task<int> CreateProductAsync(HttpClient client, string? name = null)
    {
        var response = await client.PostAsJsonAsync("/products", new { name = name ?? UniqueName() });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("id").GetInt32();
    }

    public static async Task<HttpResponseMessage> ImportCsvAsync(HttpClient client, int productId, string csv)
    {
        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        form.Add(fileContent, "file", "sales.csv");
        return await client.PostAsync($"/products/{productId}/sales/import", form);
    }
}
