using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace LumenX.Dashboard.Services;

public sealed class LumenApiClient : ILumenApiClient
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;

    public LumenApiClient(HttpClient http)
    {
        _http = http;
    }

    public Task<ApiResult<List<ProductDto>>> GetProductsAsync(CancellationToken ct = default) =>
        SendAsync<List<ProductDto>>(() => _http.GetAsync("products", ct), ct);

    public Task<ApiResult<ProductDto>> GetProductAsync(int productId, CancellationToken ct = default) =>
        SendAsync<ProductDto>(() => _http.GetAsync($"products/{productId}", ct), ct);

    public Task<ApiResult<ProductDto>> CreateProductAsync(string name, string? sku, CancellationToken ct = default) =>
        SendAsync<ProductDto>(
            () => _http.PostAsJsonAsync("products", new CreateProductRequest(name, sku), Json, ct), ct);

    public Task<ApiResult<List<SalePointDto>>> GetSalesAsync(
        int productId, DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        var url = $"products/{productId}/sales";
        var parts = new List<string>();
        if (from.HasValue) parts.Add("from=" + Fmt.Iso(from.Value));
        if (to.HasValue) parts.Add("to=" + Fmt.Iso(to.Value));
        if (parts.Count > 0) url += "?" + string.Join("&", parts);

        return SendAsync<List<SalePointDto>>(() => _http.GetAsync(url, ct), ct);
    }

    public Task<ApiResult<ImportResultDto>> ImportSalesAsync(
        int productId, string fileName, Stream content, CancellationToken ct = default) =>
        SendAsync<ImportResultDto>(async () =>
        {
            using var form = new MultipartFormDataContent();
            var fileContent = new StreamContent(content);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
            form.Add(fileContent, "file", fileName);
            return await _http.PostAsync($"products/{productId}/sales/import", form, ct);
        }, ct);

    public Task<ApiResult<ForecastRunDto>> GetLatestForecastAsync(int productId, CancellationToken ct = default) =>
        SendAsync<ForecastRunDto>(() => _http.GetAsync($"products/{productId}/forecast", ct), ct);

    public Task<ApiResult<ExplanationDto>> GetExplanationAsync(
        int productId, string language, bool useAi, CancellationToken ct = default)
    {
        var url = $"products/{productId}/forecast/explanation?lang={Uri.EscapeDataString(language)}&useAi={(useAi ? "true" : "false")}";
        return SendAsync<ExplanationDto>(() => _http.GetAsync(url, ct), ct);
    }

    public Task<ApiResult<ReorderSuggestionDto>> GetReorderAsync(
        int productId, int leadTimeDays, int reviewDays, int serviceLevel, double? onHand, CancellationToken ct = default)
    {
        var url = $"products/{productId}/reorder?leadTimeDays={leadTimeDays}&reviewDays={reviewDays}&serviceLevel={serviceLevel}";
        if (onHand.HasValue)
        {
            url += "&onHand=" + onHand.Value.ToString("0.###", CultureInfo.InvariantCulture);
        }

        return SendAsync<ReorderSuggestionDto>(() => _http.GetAsync(url, ct), ct);
    }

    public Task<ApiResult<AskResponseDto>> AskAsync(int productId, string question, CancellationToken ct = default) =>
        SendAsync<AskResponseDto>(
            () => _http.PostAsJsonAsync($"products/{productId}/ask", new AskRequest(question, null), Json, ct), ct);

    public Task<ApiResult<ForecastRunDto>> CreateForecastAsync(
        int productId, int? horizon, string? method, CancellationToken ct = default) =>
        SendAsync<ForecastRunDto>(
            () => _http.PostAsJsonAsync(
                $"products/{productId}/forecast", new ForecastRequest(horizon, method), Json, ct),
            ct);

    private static async Task<ApiResult<T>> SendAsync<T>(Func<Task<HttpResponseMessage>> send, CancellationToken ct)
    {
        try
        {
            using var response = await send();

            if (response.IsSuccessStatusCode)
            {
                var value = await response.Content.ReadFromJsonAsync<T>(Json, ct);
                return value is null
                    ? ApiResult<T>.Fail((int)response.StatusCode, "Risposta vuota dal backend.")
                    : ApiResult<T>.Ok(value);
            }

            var detail = await ReadProblemDetailAsync(response, ct);
            return ApiResult<T>.Fail((int)response.StatusCode, detail);
        }
        catch (HttpRequestException)
        {
            return ApiResult<T>.Fail(0, "Backend non raggiungibile. Controlla che sia avviato e che Backend:BaseUrl sia corretto.");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return ApiResult<T>.Fail(0, "Il backend non ha risposto in tempo (timeout).");
        }
        catch (JsonException)
        {
            return ApiResult<T>.Fail(0, "Risposta del backend in un formato non atteso.");
        }
    }

    private static async Task<string> ReadProblemDetailAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            var text = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(text);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("detail", out var detail)
                && detail.ValueKind == JsonValueKind.String)
            {
                var s = detail.GetString();
                if (!string.IsNullOrWhiteSpace(s)) return s;
            }
        }
        catch (JsonException)
        {
            // Corpo non JSON: uso il messaggio generico qui sotto.
        }

        return $"Errore HTTP {(int)response.StatusCode}.";
    }
}
