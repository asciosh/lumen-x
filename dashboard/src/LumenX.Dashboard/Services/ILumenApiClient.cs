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

    /// <summary>Ultimo forecast salvato. Se non esiste, StatusCode e' 404.</summary>
    Task<ApiResult<ForecastRunDto>> GetLatestForecastAsync(int productId, CancellationToken ct = default);

    /// <summary>Spiegazione dell'ultimo forecast. language: "it" o "en". useAi: true = prova Gemini.</summary>
    Task<ApiResult<ExplanationDto>> GetExplanationAsync(
        int productId, string language, bool useAi, CancellationToken ct = default);

    /// <summary>Suggerimento di riordino sull'ultimo forecast. onHand e' facoltativo.</summary>
    Task<ApiResult<ReorderSuggestionDto>> GetReorderAsync(
        int productId, int leadTimeDays, int reviewDays, int serviceLevel, double? onHand, CancellationToken ct = default);

    /// <summary>Domanda in linguaggio naturale sui dati del prodotto. La lingua si riconosce dalla domanda.</summary>
    Task<ApiResult<AskResponseDto>> AskAsync(int productId, string question, CancellationToken ct = default);

    Task<ApiResult<ForecastRunDto>> CreateForecastAsync(
        int productId, int? horizon, string? method, CancellationToken ct = default);
}
