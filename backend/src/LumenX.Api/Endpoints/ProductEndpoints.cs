using LumenX.Api.Contracts;
using LumenX.Api.Data;
using LumenX.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Endpoints;

public static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/products", async (LumenXDbContext db, CancellationToken ct) =>
        {
            var items = await db.Products
                .AsNoTracking()
                .OrderBy(p => p.Id)
                .Select(p => new ProductDto(p.Id, p.Name, p.Sku, p.CreatedAtUtc))
                .ToListAsync(ct);
            return Results.Ok(items);
        });

        app.MapGet("/products/{productId:int}", async (int productId, LumenXDbContext db, CancellationToken ct) =>
        {
            var product = await db.Products
                .AsNoTracking()
                .Where(p => p.Id == productId)
                .Select(p => new ProductDto(p.Id, p.Name, p.Sku, p.CreatedAtUtc))
                .FirstOrDefaultAsync(ct);
            return product is null
                ? Problems.NotFound($"Product {productId} not found.")
                : Results.Ok(product);
        });

        app.MapPost("/products", async (CreateProductRequest request, LumenXDbContext db, CancellationToken ct) =>
        {
            var name = request.Name?.Trim();
            if (string.IsNullOrEmpty(name))
            {
                return Problems.Unprocessable("The 'name' field is required.");
            }
            if (name.Length > 200)
            {
                return Problems.Unprocessable("The 'name' field can have at most 200 characters.");
            }

            var sku = request.Sku?.Trim();
            if (string.IsNullOrEmpty(sku))
            {
                sku = null;
            }
            else if (sku.Length > 100)
            {
                return Problems.Unprocessable("The 'sku' field can have at most 100 characters.");
            }

            var lowerName = name.ToLowerInvariant();
            if (await db.Products.AnyAsync(p => p.Name.ToLower() == lowerName, ct))
            {
                return Problems.Conflict($"A product named '{name}' already exists.");
            }

            var product = new Product
            {
                Name = name,
                Sku = sku,
                CreatedAtUtc = DateTime.UtcNow
            };
            db.Products.Add(product);

            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Unique index on the name violated by a concurrent request.
                return Problems.Conflict($"A product named '{name}' already exists.");
            }

            var dto = new ProductDto(product.Id, product.Name, product.Sku, product.CreatedAtUtc);
            return Results.Created($"/products/{product.Id}", dto);
        });

        return app;
    }
}
