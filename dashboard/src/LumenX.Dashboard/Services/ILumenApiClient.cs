namespace LumenX.Dashboard.Services;

public interface ILumenApiClient
{
    Task<ApiResult<List<ProductDto>>> GetProductsAsync(CancellationToken ct = default);
    Task<ApiResult<ProductDto>> GetProductAsync(int productId, CancellationToken ct = default);
    Task<ApiResult<ProductDto>> CreateProductAsync(string name, string? sku, CancellationToken ct = default);

    Task<ApiResult<List<SalePointDto>>> GetSalesAsync(
        int productId, DateOnly? from, DateOnly? to, CancellationToken ct = default);

    Task<ApiResult<ImportResultDto>> ImportSalesAsync(
        int productId, string fileName, Stream content, CancellationToken ct = default);

    /// <summary>Latest saved forecast. If none exists, StatusCode is 404.</summary>
    Task<ApiResult<ForecastRunDto>> GetLatestForecastAsync(int productId, CancellationToken ct = default);

    /// <summary>Explanation of the latest forecast. language: "it" or "en". useAi: true = try Gemini.</summary>
    Task<ApiResult<ExplanationDto>> GetExplanationAsync(
        int productId, string language, bool useAi, CancellationToken ct = default);

    /// <summary>Reorder suggestion on the latest forecast. onHand is optional.</summary>
    Task<ApiResult<ReorderSuggestionDto>> GetReorderAsync(
        int productId, int leadTimeDays, int reviewDays, int serviceLevel, double? onHand, CancellationToken ct = default);

    /// <summary>Natural-language question about the product's data. The language is the one to answer in (null = detect it from the question).</summary>
    Task<ApiResult<AskResponseDto>> AskAsync(int productId, string question, string? language = null, CancellationToken ct = default);

    Task<ApiResult<ForecastRunDto>> CreateForecastAsync(
        int productId, int? horizon, string? method, CancellationToken ct = default);
}
