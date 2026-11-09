using LumenX.Api.Contracts;
using LumenX.Api.Data;
using LumenX.Api.Explanations;
using LumenX.Api.Forecasting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Endpoints;

public static class ExplanationEndpoints
{
    public static IEndpointRouteBuilder MapExplanationEndpoints(this IEndpointRouteBuilder app)
    {
        // ?lang=it|en (default it) & useAi=true|false (default true: use Gemini if configured)
        app.MapGet("/products/{productId:int}/forecast/explanation", GetExplanationAsync);
        return app;
    }

    private static async Task<IResult> GetExplanationAsync(
        int productId,
        [FromQuery(Name = "lang")] string? lang,
        [FromQuery(Name = "useAi")] bool? useAi,
        LumenXDbContext db,
        ExplanationService service,
        CancellationToken ct)
    {
        var language = ExplanationLanguage.Normalize(lang);
        if (language is null)
        {
            return Problems.Unprocessable("'lang' must be 'it' or 'en'.");
        }

        var product = await db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == productId, ct);
        if (product is null)
        {
            return Problems.NotFound($"Product {productId} not found.");
        }

        var run = await db.ForecastRuns
            .AsNoTracking()
            .Include(r => r.Points)
            .Where(r => r.ProductId == productId)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);
        if (run is null)
        {
            return Problems.NotFound($"No forecast saved for product {productId}.");
        }

        var sales = await db.SalesRecords
            .AsNoTracking()
            .Where(s => s.ProductId == productId)
            .OrderBy(s => s.Date)
            .Select(s => new SalePointDto(s.Date, s.Quantity))
            .ToListAsync(ct);

        var runDto = ForecastMapper.ToDto(run);
        if (sales.Count == 0 || runDto.Forecast.Count == 0)
        {
            return Problems.Unprocessable("Sales or forecast points are missing: the explanation cannot be built.");
        }

        var facts = FactsBuilder.Build(product.Name, sales, runDto);
        var result = await service.ExplainAsync(facts, language, useAi ?? true, ct);

        return Results.Ok(new ExplanationDto(run.Id, language, result.Text, result.Source, result.Note, facts));
    }
}
