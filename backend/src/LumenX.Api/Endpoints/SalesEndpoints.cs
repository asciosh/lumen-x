using LumenX.Api.Contracts;
using LumenX.Api.Data;
using LumenX.Api.Sales;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Endpoints;

public static class SalesEndpoints
{
    public static IEndpointRouteBuilder MapSalesEndpoints(this IEndpointRouteBuilder app)
    {
        // Import CSV (multipart, campo "file").
        app.MapPost("/products/{productId:int}/sales/import",
            async (int productId, IFormFile? file, LumenXDbContext db, CancellationToken ct) =>
            {
                if (file is null || file.Length == 0)
                {
                    return Problems.BadRequest("Manca il file CSV (campo multipart 'file').");
                }

                if (!await db.Products.AnyAsync(p => p.Id == productId, ct))
                {
                    return Problems.NotFound($"Prodotto {productId} non trovato.");
                }

                using var stream = file.OpenReadStream();
                using var reader = new StreamReader(stream);
                var parsed = SalesCsvParser.Parse(reader);

                if (parsed.FatalError is not null)
                {
                    return Problems.Unprocessable(parsed.FatalError);
                }

                var result = await SalesImporter.ImportAsync(db, productId, parsed, ct);
                return Results.Ok(result);
            })
            .DisableAntiforgery();

        // Lettura vendite con filtro opzionale ?from=yyyy-MM-dd&to=yyyy-MM-dd (estremi inclusi).
        app.MapGet("/products/{productId:int}/sales",
            async (int productId,
                   [FromQuery(Name = "from")] DateOnly? dateFrom,
                   [FromQuery(Name = "to")] DateOnly? dateTo,
                   LumenXDbContext db,
                   CancellationToken ct) =>
            {
                if (dateFrom.HasValue && dateTo.HasValue && dateFrom.Value > dateTo.Value)
                {
                    return Problems.Unprocessable("'from' non può essere successivo a 'to'.");
                }

                if (!await db.Products.AnyAsync(p => p.Id == productId, ct))
                {
                    return Problems.NotFound($"Prodotto {productId} non trovato.");
                }

                var query = db.SalesRecords.AsNoTracking().Where(s => s.ProductId == productId);
                if (dateFrom.HasValue)
                {
                    var f = dateFrom.Value;
                    query = query.Where(s => s.Date >= f);
                }
                if (dateTo.HasValue)
                {
                    var t = dateTo.Value;
                    query = query.Where(s => s.Date <= t);
                }

                var items = await query
                    .OrderBy(s => s.Date)
                    .Select(s => new SalePointDto(s.Date, s.Quantity))
                    .ToListAsync(ct);
                return Results.Ok(items);
            });

        return app;
    }
}
