using LumenX.Dashboard.Services;

namespace LumenX.Dashboard.Tests.TestSupport;

public sealed record ReorderCall(int ProductId, int LeadTimeDays, int ReviewDays, int ServiceLevel, double? OnHand);

/// <summary>Sostituisce il backend nei test della dashboard: nessuna rete, risposte configurabili, chiamate registrate.</summary>
public sealed class FakeLumenApiClient : ILumenApiClient
{
    // ---- risposte configurabili ----
    public ApiResult<List<ProductDto>> Products { get; set; } = ApiResult<List<ProductDto>>.Ok(new List<ProductDto>());
    public ApiResult<ProductDto> Product { get; set; } = ApiResult<ProductDto>.Ok(Samples.Product());
    public ApiResult<ProductDto>? CreateProductResult { get; set; }
    public ApiResult<List<SalePointDto>> Sales { get; set; } = ApiResult<List<SalePointDto>>.Ok(Samples.Sales(60));
    public ApiResult<ForecastRunDto> LatestForecast { get; set; } = ApiResult<ForecastRunDto>.Fail(404, "Nessun forecast salvato.");
    public ApiResult<ForecastRunDto> CreateForecastResult { get; set; } = ApiResult<ForecastRunDto>.Ok(Samples.Forecast());
    public Func<string, bool, ApiResult<ExplanationDto>>? ExplanationFactory { get; set; }
    public Func<ReorderCall, ApiResult<ReorderSuggestionDto>>? ReorderFactory { get; set; }
    public Func<string, ApiResult<AskResponseDto>>? AskFactory { get; set; }

    // ---- chiamate ricevute ----
    public List<(string Name, string? Sku)> CreatedProducts { get; } = new();
    public List<(DateOnly? From, DateOnly? To)> SalesCalls { get; } = new();
    public List<(string Language, bool UseAi)> ExplanationCalls { get; } = new();
    public List<ReorderCall> ReorderCalls { get; } = new();
    public List<(int ProductId, string Question)> AskCalls { get; } = new();
    public List<(int ProductId, int? Horizon, string? Method)> ForecastCalls { get; } = new();

    public Task<ApiResult<List<ProductDto>>> GetProductsAsync(CancellationToken ct = default) =>
        Task.FromResult(Products);

    public Task<ApiResult<ProductDto>> GetProductAsync(int productId, CancellationToken ct = default) =>
        Task.FromResult(Product);

    public Task<ApiResult<ProductDto>> CreateProductAsync(string name, string? sku, CancellationToken ct = default)
    {
        CreatedProducts.Add((name, sku));
        var result = CreateProductResult
                     ?? ApiResult<ProductDto>.Ok(new ProductDto(100 + CreatedProducts.Count, name, sku, Samples.Now));

        if (result.IsSuccess && Products.IsSuccess)
        {
            var list = new List<ProductDto>(Products.Value!) { result.Value! };
            Products = ApiResult<List<ProductDto>>.Ok(list);
        }

        return Task.FromResult(result);
    }

    public Task<ApiResult<List<SalePointDto>>> GetSalesAsync(
        int productId, DateOnly? from, DateOnly? to, CancellationToken ct = default)
    {
        SalesCalls.Add((from, to));
        return Task.FromResult(Sales);
    }

    public Task<ApiResult<ImportResultDto>> ImportSalesAsync(
        int productId, string fileName, Stream content, CancellationToken ct = default) =>
        Task.FromResult(ApiResult<ImportResultDto>.Fail(500, "Non usato nei test."));

    public Task<ApiResult<ForecastRunDto>> GetLatestForecastAsync(int productId, CancellationToken ct = default) =>
        Task.FromResult(LatestForecast);

    public Task<ApiResult<ExplanationDto>> GetExplanationAsync(
        int productId, string language, bool useAi, CancellationToken ct = default)
    {
        ExplanationCalls.Add((language, useAi));
        var result = ExplanationFactory is not null
            ? ExplanationFactory(language, useAi)
            : ApiResult<ExplanationDto>.Ok(new ExplanationDto(
                1, language, $"Testo di prova ({language})", useAi ? "gemini" : "template", null));
        return Task.FromResult(result);
    }

    public Task<ApiResult<ReorderSuggestionDto>> GetReorderAsync(
        int productId, int leadTimeDays, int reviewDays, int serviceLevel, double? onHand, CancellationToken ct = default)
    {
        var call = new ReorderCall(productId, leadTimeDays, reviewDays, serviceLevel, onHand);
        ReorderCalls.Add(call);

        if (ReorderFactory is not null)
        {
            return Task.FromResult(ReorderFactory(call));
        }

        // Numeri fissi (come nell'esempio a mano: domanda 1400, sicurezza 123,09), tranne l'ordine suggerito.
        const double level = 1523.09;
        var suggested = onHand.HasValue ? Math.Ceiling(Math.Max(0, level - onHand.Value)) : (double?)null;
        return Task.FromResult(ApiResult<ReorderSuggestionDto>.Ok(new ReorderSuggestionDto(
            1, "blend", leadTimeDays, reviewDays, leadTimeDays + reviewDays, serviceLevel, 1.6449,
            1400, 20, 123.09, level, onHand, suggested, new List<string>())));
    }

    public Task<ApiResult<AskResponseDto>> AskAsync(int productId, string question, CancellationToken ct = default)
    {
        AskCalls.Add((productId, question));
        var result = AskFactory is not null
            ? AskFactory(question)
            : ApiResult<AskResponseDto>.Ok(new AskResponseDto(
                question, "it", "sales_total", true, $"Risposta a: {question}", new List<string>()));
        return Task.FromResult(result);
    }

    public Task<ApiResult<ForecastRunDto>> CreateForecastAsync(
        int productId, int? horizon, string? method, CancellationToken ct = default)
    {
        ForecastCalls.Add((productId, horizon, method));
        return Task.FromResult(CreateForecastResult);
    }
}
