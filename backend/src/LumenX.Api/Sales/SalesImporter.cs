using LumenX.Api.Contracts;
using LumenX.Api.Data;
using LumenX.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Sales;

public static class SalesImporter
{
    public const int MaxReportedErrors = 100;

    /// <summary>
    /// Upsert by (product, date). If the same date appears several times in the file, the last row wins.
    /// </summary>
    public static async Task<ImportResultDto> ImportAsync(
        LumenXDbContext db, int productId, CsvParseResult parsed, CancellationToken ct)
    {
        var latestByDate = new Dictionary<DateOnly, double>();
        foreach (var row in parsed.Rows)
        {
            latestByDate[row.Date] = row.Quantity;
        }

        var duplicates = parsed.Rows.Count - latestByDate.Count;
        var inserted = 0;
        var updated = 0;

        if (latestByDate.Count > 0)
        {
            var min = latestByDate.Keys.Min();
            var max = latestByDate.Keys.Max();

            var existing = await db.SalesRecords
                .Where(s => s.ProductId == productId && s.Date >= min && s.Date <= max)
                .ToListAsync(ct);
            var existingByDate = existing.ToDictionary(s => s.Date);

            foreach (var pair in latestByDate)
            {
                if (existingByDate.TryGetValue(pair.Key, out var record))
                {
                    record.Quantity = pair.Value;
                    updated++;
                }
                else
                {
                    db.SalesRecords.Add(new SalesRecord
                    {
                        ProductId = productId,
                        Date = pair.Key,
                        Quantity = pair.Value
                    });
                    inserted++;
                }
            }

            await db.SaveChangesAsync(ct);
        }

        var errors = parsed.Errors
            .Take(MaxReportedErrors)
            .Select(e => new RowErrorDto(e.Line, e.Message))
            .ToList();

        return new ImportResultDto(
            TotalRows: parsed.TotalRows,
            ValidRows: parsed.Rows.Count,
            Inserted: inserted,
            Updated: updated,
            DuplicatesInFile: duplicates,
            Rejected: parsed.Errors.Count,
            Errors: errors,
            ErrorsTruncated: parsed.Errors.Count > MaxReportedErrors);
    }
}
