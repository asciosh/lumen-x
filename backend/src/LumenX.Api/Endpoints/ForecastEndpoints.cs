using LumenX.Api.Contracts;
using LumenX.Api.Data;
using LumenX.Api.Forecasting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Endpoints;

public static class ForecastEndpoints
{
    public const int MinSeriesDays = 42;
    public const int MaxHorizon = 90;

    private static readonly string[] AllowedMethods = { "auto", "naive", "ets", "lightgbm" };

    public static IEndpointRouteBuilder MapForecastEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/products/{productId:int}/forecast", CreateForecastAsync);
        app.MapGet("/products/{productId:int}/forecast", GetLatestForecastAsync);
        return app;
    }

    private static async Task<IResult> CreateForecastAsync(
        int productId,
        [FromBody] ForecastRequestDto? body,
        LumenXDbContext db,
        IForecastingClient client,
        CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(p => p.Id == productId, ct))
        {
            return Problems.NotFound($"Product {productId} not found.");
        }

        var horizon = body?.Horizon;
        if (horizon is < 1 or > MaxHorizon)
        {
            return Problems.Unprocessable($"'horizon' must be between 1 and {MaxHorizon}.");
        }

        string? method = body?.Method?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(method))
        {
            method = null;
        }
        else if (!AllowedMethods.Contains(method))
        {
            return Problems.Unprocessable($"'method' must be one of: {string.Join(", ", AllowedMethods)}.");
        }

        var series = await db.SalesRecords
            .AsNoTracking()
            .Where(s => s.ProductId == productId)
            .OrderBy(s => s.Date)
            .Select(s => new SeriesPointDto { Date = s.Date, Value = s.Quantity })
            .ToListAsync(ct);

        if (series.Count < MinSeriesDays)
        {
            return Problems.Unprocessable(
                $"At least {MinSeriesDays} days of sales are required: found {series.Count}.");
        }

        var request = new ForecastingRequest
        {
            Series = series,
            Horizon = horizon,
            Method = method
        };

        ForecastingResponse response;
        try
        {
            response = await client.ForecastAsync(request, ct);
        }
        catch (ForecastingInputException ex)
        {
            return Problems.Unprocessable($"The forecasting service rejected the data: {ex.Message}");
        }
        catch (ForecastingUnavailableException)
        {
            return Problems.ServiceUnavailable("The forecasting service is unreachable. Try again later.");
        }
        catch (ForecastingFailedException ex)
        {
            return Problems.BadGateway(ex.Message);
        }

        var run = ForecastMapper.ToEntity(productId, method, response);
        db.ForecastRuns.Add(run);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/products/{productId}/forecast", ForecastMapper.ToDto(run));
    }

    private static async Task<IResult> GetLatestForecastAsync(
        int productId, LumenXDbContext db, CancellationToken ct)
    {
        if (!await db.Products.AnyAsync(p => p.Id == productId, ct))
        {
            return Problems.NotFound($"Product {productId} not found.");
        }

        var run = await db.ForecastRuns
            .AsNoTracking()
            .Include(r => r.Points)
            .Where(r => r.ProductId == productId)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);

        return run is null
            ? Problems.NotFound($"No forecast saved for product {productId}.")
            : Results.Ok(ForecastMapper.ToDto(run));
    }
}
