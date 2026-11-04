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

    Task<ApiResult<ForecastRunDto>> CreateForecastAsync(
        int productId, int? horizon, string? method, CancellationToken ct = default);
}
