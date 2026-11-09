using LumenX.Api.Contracts;
using LumenX.Api.Data;
using LumenX.Api.Forecasting;
using LumenX.Api.Reorder;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Endpoints;

public static class ReorderEndpoints
{
    public static IEndpointRouteBuilder MapReorderEndpoints(this IEndpointRouteBuilder app)
    {
        // ?leadTimeDays=7&reviewDays=7&serviceLevel=95&onHand=300  (tutti facoltativi)
        app.MapGet("/products/{productId:int}/reorder", GetReorderAsync);
        return app;
    }

    private static async Task<IResult> GetReorderAsync(
        int productId,
        [FromQuery(Name = "leadTimeDays")] int? leadTimeDays,
        [FromQuery(Name = "reviewDays")] int? reviewDays,
        [FromQuery(Name = "serviceLevel")] int? serviceLevel,
        [FromQuery(Name = "onHand")] double? onHand,
        LumenXDbContext db,
        CancellationToken ct)
    {
        var productExists = await db.Products.AsNoTracking().AnyAsync(p => p.Id == productId, ct);
        if (!productExists)
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

        var totalDays = await db.SalesRecords.AsNoTracking().CountAsync(s => s.ProductId == productId, ct);
        var zeroDays = await db.SalesRecords.AsNoTracking().CountAsync(s => s.ProductId == productId && s.Quantity == 0, ct);
        var zeroDaysPercent = totalDays == 0 ? 0 : zeroDays * 100.0 / totalDays;

        var outcome = ReorderCalculator.Calculate(
            ForecastMapper.ToDto(run),
            leadTimeDays ?? 7,
            reviewDays ?? 7,
            serviceLevel ?? 95,
            onHand,
            zeroDaysPercent);

        return outcome.Suggestion is not null
            ? Results.Ok(outcome.Suggestion)
            : Problems.Unprocessable(outcome.Error ?? "Invalid parameters.");
    }
}
