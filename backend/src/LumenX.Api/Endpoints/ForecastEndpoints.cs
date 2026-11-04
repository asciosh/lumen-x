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
            return Problems.NotFound($"Prodotto {productId} non trovato.");
        }

        var horizon = body?.Horizon;
        if (horizon is < 1 or > MaxHorizon)
        {
            return Problems.Unprocessable($"'horizon' deve essere compreso tra 1 e {MaxHorizon}.");
        }

        string? method = body?.Method?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(method))
        {
            method = null;
        }
        else if (!AllowedMethods.Contains(method))
        {
            return Problems.Unprocessable($"'method' deve essere uno tra: {string.Join(", ", AllowedMethods)}.");
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
                $"Servono almeno {MinSeriesDays} giorni di vendite: ne risultano {series.Count}.");
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
            return Problems.Unprocessable($"Il servizio di forecasting ha rifiutato i dati: {ex.Message}");
        }
        catch (ForecastingUnavailableException)
        {
            return Problems.ServiceUnavailable("Il servizio di forecasting non è raggiungibile. Riprova più tardi.");
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
            return Problems.NotFound($"Prodotto {productId} non trovato.");
        }

        var run = await db.ForecastRuns
            .AsNoTracking()
            .Include(r => r.Points)
            .Where(r => r.ProductId == productId)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);

        return run is null
            ? Problems.NotFound($"Nessun forecast salvato per il prodotto {productId}.")
            : Results.Ok(ForecastMapper.ToDto(run));
    }
}
